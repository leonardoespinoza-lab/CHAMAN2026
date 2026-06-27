import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import {
  IDispositivo,
  IListado,
  IMaleza,
  IPronosticoEstacionMeteorologica,
  IRecomendacionMaleza,
  ISiembra,
  IUmbralEmergenciaMaleza,
} from 'modelos/src';
import { MalezaService } from '../../../../../auxiliares/http/maleza.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetallesLote } from '../detalles-lote.component';
import { buildSentekProfile } from '../../../../modulo-admin/dispositivos/detalles-dispositivo/sentek-profile';

const CULTIVOS_CON_PREDICCION_MALEZAS = ['Soja', 'Trigo', 'Maiz'];

interface IAnalisisMaleza {
  maleza: IMaleza;
  htt7Dias: number;
  emergencia7Dias: number;
  avancePct: number;
  humedadReferencia?: number;
  temperaturaReferencia?: number;
  estado: string;
  estadoCorto: string;
  lecturaCorta: string;
  severidad: 'baja' | 'media' | 'alta';
  recomendacion: string;
  fuenteDatos: string;
  detalleFuente: string;
  formula: string;
  umbralesAnalizados: IUmbralAnalisis[];
  recomendaciones: IRecomendacionMaleza[];
}

interface IUmbralAnalisis {
  porcentaje?: number;
  horasTermicas?: number;
  progreso: number;
  lectura: string;
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
  public verDetalleMaleza = false;
  public malezaSeleccionada?: IAnalisisMaleza;

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

  public get resumenGeneral(): string {
    if (!this.cultivoCompatible) {
      return 'Motor habilitado para trigo, soja y maiz.';
    }
    if (!this.malezas.length) {
      return `${this.cultivo}: sin modelos cargados para este cultivo.`;
    }
    const mayor = [...this.analisis].sort((a, b) => b.avancePct - a.avancePct)[0];
    return mayor
      ? `${this.cultivo}: mayor avance proyectado en ${mayor.maleza.nombre || 'maleza'}`
      : `${this.cultivo}: seguimiento de emergencia activo.`;
  }

  public get analisis(): IAnalisisMaleza[] {
    return this.malezas.map((maleza) => this.analizarMaleza(maleza));
  }

  public abrirDetalleMaleza(item: IAnalisisMaleza): void {
    this.malezaSeleccionada = item;
    this.verDetalleMaleza = true;
  }

  public cerrarDetalleMaleza(): void {
    this.verDetalleMaleza = false;
    this.malezaSeleccionada = undefined;
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
    const htt7Dias = this.calcularHtt7Dias(maleza, temperaturaReferencia, humedadReferencia);
    const emergencia7Dias = this.gompertz(
      htt7Dias,
      parametros.kMaxPorcentaje || 100,
      parametros.beta || 0,
      parametros.muHorasTermicas || 0
    );
    const umbralesAnalizados = this.analizarUmbrales(maleza.umbrales || [], htt7Dias);
    const progresoE10 = umbralesAnalizados[0]?.progreso || 0;
    const avancePct = this.porcentaje(Math.max(emergencia7Dias, progresoE10));
    const severidad = this.severidad(avancePct, emergencia7Dias);
    const estado = severidad === 'alta' ? 'Ventana de control' : severidad === 'media' ? 'Monitoreo cercano' : 'Baja emergencia';
    const estadoCorto = severidad === 'alta' ? 'Avance alto' : severidad === 'media' ? 'Avance medio' : 'Avance bajo';
    const fuenteDatos = this.fuenteDatos(temperaturaReferencia, humedadReferencia);

    return {
      maleza,
      htt7Dias,
      emergencia7Dias,
      avancePct,
      temperaturaReferencia,
      humedadReferencia,
      estado,
      estadoCorto,
      lecturaCorta: this.lecturaCorta(severidad, emergencia7Dias, progresoE10),
      severidad,
      recomendacion: this.recomendacion(severidad, maleza),
      fuenteDatos,
      detalleFuente: this.detalleFuente(temperaturaReferencia, humedadReferencia),
      formula: this.formulaMaleza(maleza),
      umbralesAnalizados,
      recomendaciones: maleza.recomendaciones || [],
    };
  }

  private calcularHtt7Dias(
    maleza: IMaleza,
    temperaturaSensor?: number,
    humedadSensor?: number,
  ): number {
    const parametros = maleza.parametros || {};
    const base = parametros.temperaturaBase || 0;
    const deltaHoras = parametros.deltaHoras || 24;
    const theta50 = parametros.humedadTheta50 || 0.2;
    const escala = parametros.humedadEscala || 0.03;

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

  private severidad(avancePct: number, emergenciaPct: number): IAnalisisMaleza['severidad'] {
    if (emergenciaPct >= 10 || avancePct >= 100) return 'alta';
    if (emergenciaPct >= 5 || avancePct >= 65) return 'media';
    return 'baja';
  }

  private lecturaCorta(severidad: IAnalisisMaleza['severidad'], emergenciaPct: number, progresoE10: number): string {
    if (!this.pronosticos.length) {
      return 'Falta pronostico climatico para proyectar.';
    }
    if (severidad === 'alta') {
      return `Control temprano: E10 al ${this.redondear(progresoE10, 0)}%.`;
    }
    if (severidad === 'media') {
      return `Monitorear nacimientos: emergencia ${this.redondear(emergenciaPct, 1)}%.`;
    }
    return `Emergencia baja: ${this.redondear(emergenciaPct, 1)}% proyectado.`;
  }

  private analizarUmbrales(umbrales: IUmbralEmergenciaMaleza[], htt7Dias: number): IUmbralAnalisis[] {
    return [...umbrales]
      .sort((a, b) => Number(a.porcentaje || 0) - Number(b.porcentaje || 0))
      .map((umbral) => {
        const progreso = this.progresoUmbralPorHoras(htt7Dias, umbral.horasTermicas);
        return {
          porcentaje: umbral.porcentaje,
          horasTermicas: umbral.horasTermicas,
          progreso,
          lectura: progreso >= 100 ? 'alcanzado' : progreso >= 65 ? 'cercano' : 'en seguimiento',
        };
      });
  }

  private fuenteDatos(temperaturaSensor?: number, humedadSensor?: number): string {
    if (temperaturaSensor !== undefined && humedadSensor !== undefined) return 'Sensor de suelo';
    if (temperaturaSensor !== undefined || humedadSensor !== undefined) return 'Sensor + clima';
    return 'Clima estimado';
  }

  private detalleFuente(temperaturaSensor?: number, humedadSensor?: number): string {
    const temp = temperaturaSensor !== undefined ? `${this.redondear(temperaturaSensor, 1)} C de suelo` : 'temperatura del pronostico';
    const humedad = humedadSensor !== undefined ? `${this.redondear(humedadSensor * 100, 0)}% de humedad de suelo` : 'proxy hidrico por lluvia y HR';
    return `Usa ${temp} y ${humedad} sobre los proximos ${this.pronosticos.length || 0} dias.`;
  }

  private formulaMaleza(maleza: IMaleza): string {
    const parametros = maleza.parametros || {};
    return `Emergencia = K x exp(-exp(-beta x (HTT - mu))). K=${parametros.kMaxPorcentaje || '-'}, beta=${parametros.beta || '-'}, mu=${parametros.muHorasTermicas || '-'} HTT.`;
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
    return this.progresoUmbralPorHoras(analisis.htt7Dias, horasTermicas);
  }

  private progresoUmbralPorHoras(htt: number, horasTermicas?: number): number {
    if (!horasTermicas) return 0;
    return Math.max(0, Math.min(100, (htt / horasTermicas) * 100));
  }

  private temperaturaSueloReferencia(): number | undefined {
    const dispositivo = this.lote?.dispositivos?.find((d) => d.tipo === 'Sensor de Humedad de Suelo');
    return this.promedioValoresSensor(dispositivo, 'Temperatura Suelo');
  }

  private humedadSueloReferencia(): number | undefined {
    const dispositivo = this.lote?.dispositivos?.find((d) => d.tipo === 'Sensor de Humedad de Suelo');
    const perfil = buildSentekProfile(dispositivo?.ultimoReporte);
    const humedad = this.promedio(perfil.map((dato) => dato.humedad?.actual));
    if (humedad === undefined) return undefined;
    return Math.max(0, Math.min(1, humedad / 100));
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

  private redondear(valor: number, decimales: number): number {
    const factor = Math.pow(10, decimales);
    return Math.round(valor * factor) / factor;
  }

  private porcentaje(valor: number): number {
    return Math.max(0, Math.min(100, valor));
  }
}
