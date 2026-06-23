import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import {
  IClimaEstacionMeteorologica,
  IEstacion,
  IEstacionLecturaDetalle,
  IEstacionSensorDetalle,
  IValores,
} from 'modelos/src';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetallesLote } from '../detalles-lote.component';

interface VariableCentral {
  label: string;
  value: string;
  detail: string;
  icon: string;
  disponible: boolean;
}

@Component({
  selector: 'app-card-central-meteorologica',
  imports: [CommonModule, SharedModule],
  templateUrl: './card-central-meteorologica.component.html',
  styleUrl: './card-central-meteorologica.component.scss',
})
export class CardCentralMeteorologicaComponent implements OnChanges {
  @Input() public lote?: IDetallesLote;

  public variables: VariableCentral[] = [];
  public variablesDetalle: VariableCentral[] = [];
  public chips: string[] = [];
  public actualizado = '';

  private readonly numeroAr = new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 1,
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lote']) {
      this.prepararVista();
    }
  }

  public get visible(): boolean {
    return !!this.central || this.establecimiento?.fuenteClimaPreferida === 'FieldClimate' || this.clima?.fuente === 'FieldClimate';
  }

  public get nombreCentral(): string {
    return (
      this.central?.name?.custom ||
      this.central?.name?.original ||
      this.clima?.estacion ||
      'Central FieldClimate'
    );
  }

  public get subtituloCentral(): string {
    return this.central?.info?.device_name || this.central?.info?.description || 'Estacion meteorologica asignada al establecimiento';
  }

  public get estadoTexto(): string {
    if (this.clima?.fuente === 'FieldClimate') return 'Lectura FieldClimate';
    if (this.central) return 'Central asignada';
    return 'Sin central asignada';
  }

  public get usaFieldClimate(): boolean {
    return this.clima?.fuente === 'FieldClimate';
  }

  private prepararVista(): void {
    this.variables = this.crearVariables();
    this.variablesDetalle = this.crearVariablesDetalle();
    this.chips = this.crearChips();
    this.actualizado = this.formatearFecha(this.establecimiento?.climaActual?.fecha || this.clima?.fecha || this.central?.estado?.ultimoSync);
  }

  private crearVariables(): VariableCentral[] {
    return [
      this.variable('Temperatura', this.clima?.temperatura, 'C', 'pi pi-sun', 'Aire actual'),
      this.variable('Humedad', this.clima?.humedad, '%', 'pi pi-percentage', 'HR ambiente'),
      this.variable('Lluvia', this.clima?.lluvia, 'mm', 'pi pi-cloud', 'Ultima lectura'),
      this.variable('Viento', this.clima?.velocidadViento, 'km/h', 'pi pi-send', 'Velocidad'),
      this.variable('Rafaga', this.clima?.rafagaViento, 'km/h', 'pi pi-bolt', 'Maxima reciente'),
      this.variable('Direccion', this.clima?.direccionViento, 'deg', 'pi pi-compass', 'Sentido predominante'),
      this.variable('Radiacion', this.clima?.radiacionSolar, 'W/m2', 'pi pi-sparkles', 'Solar'),
      this.variable('Presion', this.clima?.presion, 'hPa', 'pi pi-gauge', 'Atmosferica'),
      this.variable('ET0', this.clima?.et0, 'mm', 'pi pi-chart-line', 'Referencia'),
    ];
  }

  private variable(label: string, valores: IValores | undefined, unidad: string, icon: string, detail: string): VariableCentral {
    const value = this.leerValor(valores);
    return {
      label,
      value: value === undefined ? '--' : `${this.numeroAr.format(value)} ${unidad}`,
      detail,
      icon,
      disponible: value !== undefined,
    };
  }

  private leerValor(valores?: IValores): number | undefined {
    const candidatos = [valores?.last, valores?.avg, valores?.max, valores?.sum, valores?.result];
    return candidatos.find((value): value is number => typeof value === 'number' && Number.isFinite(value));
  }

  private crearChips(): string[] {
    const variablesCentral = this.central?.variablesDisponibles?.filter(Boolean) || [];
    if (variablesCentral.length) {
      return variablesCentral;
    }
    return this.variables
      .filter((variable) => variable.disponible)
      .map((variable) => variable.label);
  }

  private crearVariablesDetalle(): VariableCentral[] {
    const lecturas = this.central?.ultimaLecturaDetalle || [];
    if (lecturas.length) {
      return lecturas.map((lectura) => this.variableDetalleDesdeLectura(lectura));
    }
    const sensores = this.central?.sensoresDetalle || [];
    return sensores.map((sensor) => this.variableDetalleDesdeSensor(sensor));
  }

  private variableDetalleDesdeLectura(
    lectura: IEstacionLecturaDetalle,
  ): VariableCentral {
    const value = this.leerValor(lectura);
    const unit = lectura.unit ? ` ${lectura.unit}` : '';
    return {
      label: this.traducirLabel(lectura.label),
      value: value === undefined ? '--' : `${this.numeroAr.format(value)}${unit}`,
      detail: this.detalleLectura(lectura),
      icon: this.iconoVariable(lectura.label),
      disponible: value !== undefined,
    };
  }

  private variableDetalleDesdeSensor(
    sensor: IEstacionSensorDetalle,
  ): VariableCentral {
    return {
      label: this.traducirLabel(sensor.label),
      value: '--',
      detail: sensor.unit || sensor.nameOriginal || 'Sensor disponible',
      icon: this.iconoVariable(sensor.label),
      disponible: false,
    };
  }

  private detalleLectura(lectura: IEstacionLecturaDetalle): string {
    const fecha = this.formatearFecha(lectura.fecha);
    const partes = [
      lectura.nameOriginal && lectura.nameOriginal !== lectura.label
        ? lectura.nameOriginal
        : '',
      fecha !== 'Sin sincronizacion reciente' ? fecha : '',
    ].filter(Boolean);
    return partes.join(' - ') || lectura.type || 'Ultima lectura';
  }

  private iconoVariable(label: string): string {
    const normalizado = label.toLowerCase();
    if (normalizado.includes('temperature') || normalizado.includes('temp')) return 'pi pi-sun';
    if (normalizado.includes('humidity') || normalizado.includes('humedad')) return 'pi pi-percentage';
    if (normalizado.includes('dew')) return 'pi pi-cloud';
    if (normalizado.includes('vpd') || normalizado.includes('dpv')) return 'pi pi-chart-line';
    if (normalizado.includes('precip') || normalizado.includes('rain')) return 'pi pi-cloud';
    if (normalizado.includes('battery') || normalizado.includes('bateria')) return 'pi pi-bolt';
    if (normalizado.includes('panel') || normalizado.includes('solar')) return 'pi pi-sparkles';
    if (normalizado.includes('wind')) return 'pi pi-send';
    if (normalizado.includes('delta')) return 'pi pi-gauge';
    return 'pi pi-circle';
  }

  private traducirLabel(label: string): string {
    const normalizado = label.toLowerCase();
    if (normalizado.includes('air temperature')) return 'Temperatura del aire';
    if (normalizado.includes('dew point')) return 'Punto de rocio';
    if (normalizado.includes('relative humidity')) return 'Humedad relativa';
    if (normalizado.includes('precipitation')) return 'Precipitacion';
    if (normalizado === 'vpd' || normalizado.includes('dpv')) return 'DPV';
    if (normalizado.includes('battery')) return 'Bateria';
    if (normalizado.includes('solar panel')) return 'Panel solar';
    if (normalizado.includes('solar radiation')) return 'Radiacion solar';
    if (normalizado.includes('wind speed')) return 'Velocidad viento';
    if (normalizado.includes('wind dir') || normalizado.includes('wind direction')) return 'Direccion viento';
    if (normalizado.includes('gust')) return 'Rafaga';
    return label;
  }

  private formatearFecha(fecha?: string): string {
    if (!fecha) return 'Sin sincronizacion reciente';
    const date = new Date(fecha);
    if (Number.isNaN(date.getTime())) return fecha;
    return date.toLocaleString('es-AR', {
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  }

  private get establecimiento() {
    return this.lote?.establecimiento;
  }

  private get central(): IEstacion | undefined {
    return this.establecimiento?.estacionMeteorologica;
  }

  private get clima(): IClimaEstacionMeteorologica | undefined {
    return this.establecimiento?.climaActual?.clima;
  }
}
