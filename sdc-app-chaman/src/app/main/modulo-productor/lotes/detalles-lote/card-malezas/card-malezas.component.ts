import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { IDispositivo, IListado, IMaleza, IPronosticoEstacionMeteorologica, ISiembra } from 'modelos/src';
import { MalezaService } from '../../../../../auxiliares/http/maleza.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetallesLote } from '../detalles-lote.component';

const CULTIVOS_CON_PREDICCION_MALEZAS = ['Soja', 'Trigo', 'Maiz'];

interface IAnalisisMaleza {
  maleza: IMaleza;
  htt7Dias: number;
  emergencia7Dias: number;
  humedadReferencia?: number;
  temperaturaReferencia?: number;
  estado: string;
  severidad: 'baja' | 'media' | 'alta';
  recomendacion: string;
}

@Component({
  selector: 'app-card-malezas',
  imports: [CommonModule, SharedModule],
  templateUrl: './card-malezas.component.html',
  styleUrl: './card-malezas.component.scss',
})
export class CardMalezasComponent implements OnInit, OnChanges, OnDestroy {
  @Input() public siembra?: ISiembra;
  @Input() public lote?: IDetallesLote;

  public malezas: IMaleza[] = [];
  public cargando = false;

  constructor(
    private malezaService: MalezaService,
    public helper: HelperService
  ) {}

  public get cultivo(): string {
    return this.siembra?.semilla?.cultivo || '';
  }

  public get cultivoCompatible(): boolean {
    return CULTIVOS_CON_PREDICCION_MALEZAS.includes(this.cultivo);
  }

  public get pronosticos(): IPronosticoEstacionMeteorologica[] {
    return this.lote?.establecimiento?.prediccionClimatica?.pronosticos?.slice(0, 7) || [];
  }

  public get tieneSensorSuelo(): boolean {
    return this.lote?.dispositivos?.some((dispositivo) => dispositivo.tipo === 'Sensor de Humedad de Suelo') || false;
  }

  public get analisis(): IAnalisisMaleza[] {
    return this.malezas.map((maleza) => this.analizarMaleza(maleza));
  }

  async ngOnInit(): Promise<void> {
    await this.cargarMalezas();
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['siembra'] && !changes['siembra'].firstChange) {
      await this.cargarMalezas();
    }
  }

  ngOnDestroy(): void {}

  private async cargarMalezas(): Promise<void> {
    if (!this.cultivoCompatible) {
      this.malezas = [];
      return;
    }

    this.cargando = true;
    try {
      const query = {
        filter: JSON.stringify({ cultivosObjetivo: this.cultivo }),
        sort: 'nombre',
      };
      const response = (await this.malezaService.getFiltered(query)) as IListado<IMaleza>;
      this.malezas = response.datos || [];
    } catch (error) {
      this.helper.notifError(error);
      this.malezas = [];
    } finally {
      this.cargando = false;
    }
  }

  private analizarMaleza(maleza: IMaleza): IAnalisisMaleza {
    const parametros = maleza.parametros || {};
    const temperaturaReferencia = this.temperaturaSueloReferencia();
    const humedadReferencia = this.humedadSueloReferencia();
    const htt7Dias = this.calcularHtt7Dias(maleza);
    const emergencia7Dias = this.gompertz(
      htt7Dias,
      parametros.kMaxPorcentaje || 100,
      parametros.beta || 0,
      parametros.muHorasTermicas || 0
    );
    const severidad = emergencia7Dias >= 12 ? 'alta' : emergencia7Dias >= 5 ? 'media' : 'baja';
    const estado = severidad === 'alta' ? 'Ventana activa' : severidad === 'media' ? 'Monitorear' : 'Bajo por ahora';

    return {
      maleza,
      htt7Dias,
      emergencia7Dias,
      temperaturaReferencia,
      humedadReferencia,
      estado,
      severidad,
      recomendacion: this.recomendacion(severidad, maleza),
    };
  }

  private calcularHtt7Dias(maleza: IMaleza): number {
    const parametros = maleza.parametros || {};
    const base = parametros.temperaturaBase || 0;
    const deltaHoras = parametros.deltaHoras || 24;
    const theta50 = parametros.humedadTheta50 || 0.2;
    const escala = parametros.humedadEscala || 0.03;
    const humedadSensor = this.humedadSueloReferencia();
    const temperaturaSensor = this.temperaturaSueloReferencia();

    return Number(
      this.pronosticos
        .reduce((suma, pronostico) => {
          const temp =
            temperaturaSensor ??
            this.numero(pronostico.temperatura?.avg) ??
            this.promedio([pronostico.temperatura?.min, pronostico.temperatura?.max]) ??
            0;
          const humedad = humedadSensor ?? this.humedadProxy(pronostico);
          const fT = Math.max(0, temp - base);
          const fW = 1 / (1 + Math.exp((theta50 - humedad) / escala));
          return suma + fT * fW * deltaHoras;
        }, 0)
        .toFixed(1)
    );
  }

  private gompertz(htt: number, k: number, beta: number, mu: number): number {
    if (!k || !beta || !mu) return 0;
    return Number((k * Math.exp(-Math.exp(-beta * (htt - mu)))).toFixed(1));
  }

  private recomendacion(severidad: IAnalisisMaleza['severidad'], maleza: IMaleza): string {
    if (severidad === 'alta') {
      return (
        maleza.recomendaciones?.find((item) => item.momento?.includes('E10'))?.accion ||
        'Revisar lote y definir control temprano.'
      );
    }
    if (severidad === 'media') {
      return 'Entrar a monitorear nacimientos y comparar contra zonas humedas o compactadas.';
    }
    return 'Mantener seguimiento; el modelo necesita serie de suelo para confirmar acumulado real.';
  }

  public progresoUmbral(analisis: IAnalisisMaleza, horasTermicas?: number): number {
    if (!horasTermicas) return 0;
    return Math.max(0, Math.min(100, (analisis.htt7Dias / horasTermicas) * 100));
  }

  private temperaturaSueloReferencia(): number | undefined {
    const dispositivo = this.lote?.dispositivos?.find((d) => d.tipo === 'Sensor de Humedad de Suelo');
    return this.promedioValoresSensor(dispositivo, 'Temperatura Suelo');
  }

  private humedadSueloReferencia(): number | undefined {
    const dispositivo = this.lote?.dispositivos?.find((d) => d.tipo === 'Sensor de Humedad de Suelo');
    const valor = this.promedioValoresSensor(dispositivo, 'Humedad Suelo Profundidad');
    if (valor === undefined) return undefined;
    return valor > 1 ? valor / 100 : valor;
  }

  private promedioValoresSensor(dispositivo: IDispositivo | undefined, sensor: string): number | undefined {
    const valores = (dispositivo?.ultimoReporte?.datos?.valores as any)?.[sensor];
    if (!Array.isArray(valores)) return undefined;
    const numeros = valores
      .slice(0, 3)
      .map((item) => this.numero(item?.valores?.actual ?? item?.valores?.promedio))
      .filter((valor): valor is number => valor !== undefined);
    if (!numeros.length) return undefined;
    return this.promedio(numeros);
  }

  private humedadProxy(pronostico: IPronosticoEstacionMeteorologica): number {
    const lluvia = this.numero(pronostico.lluvia) || 0;
    const humedad = this.numero(pronostico.humedad?.avg) || 55;
    return Math.max(0.05, Math.min(0.42, 0.08 + lluvia / 80 + humedad / 500));
  }

  private promedio(valores: Array<number | undefined>): number | undefined {
    const validos = valores.filter((valor): valor is number => valor !== undefined && Number.isFinite(valor));
    if (!validos.length) return undefined;
    return validos.reduce((suma, valor) => suma + valor, 0) / validos.length;
  }

  private numero(valor: unknown): number | undefined {
    const number = Number(valor);
    return Number.isFinite(number) ? number : undefined;
  }
}
