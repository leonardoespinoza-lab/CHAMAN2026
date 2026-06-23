import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import Highcharts from 'highcharts';
import {
  IClimaEstacionMeteorologica,
  IEstacion,
  IEstacionLecturaHistorica,
  IEstacionLecturaDetalle,
  IEstacionSensorDetalle,
  IValores,
} from 'modelos/src';
import { ChartComponent } from '../../../../../auxiliares/componentes/chart/chart.component';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetallesLote } from '../detalles-lote.component';

interface VariableCentral {
  key: string;
  label: string;
  value: string;
  detail: string;
  icon: string;
  disponible: boolean;
  unit?: string;
  historial: SerieVariable[];
}

interface SerieVariable {
  fecha: string;
  value: number;
}

@Component({
  selector: 'app-card-central-meteorologica',
  imports: [CommonModule, SharedModule, ChartComponent],
  templateUrl: './card-central-meteorologica.component.html',
  styleUrl: './card-central-meteorologica.component.scss',
})
export class CardCentralMeteorologicaComponent implements OnChanges {
  @Input() public lote?: IDetallesLote;

  public variables: VariableCentral[] = [];
  public variablesDetalle: VariableCentral[] = [];
  public actualizado = '';
  public graficoVisible = false;
  public variableSeleccionada?: VariableCentral;
  public chartOptions?: Highcharts.Options;

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
    if (this.clima?.fuente === 'FieldClimate') return 'Datos de central';
    if (this.central) return 'Central asignada';
    return 'Sin central asignada';
  }

  public get usaFieldClimate(): boolean {
    return this.clima?.fuente === 'FieldClimate';
  }

  public get tieneVariablesDetectadas(): boolean {
    return this.variablesDetalle.length > 0 || this.variables.some((variable) => variable.disponible);
  }

  private prepararVista(): void {
    this.variables = this.crearVariables();
    this.variablesDetalle = this.crearVariablesDetalle();
    this.actualizado = this.formatearFecha(this.fechaUltimaLecturaCentral());
  }

  public abrirGrafico(variable: VariableCentral): void {
    if (!variable.historial.length) {
      return;
    }
    this.variableSeleccionada = variable;
    this.chartOptions = this.crearOpcionesGrafico(variable);
    this.graficoVisible = true;
    setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
  }

  private crearVariables(): VariableCentral[] {
    return [
      this.variable('Temperatura', this.clima?.temperatura, 'C', 'pi pi-sun', 'Aire actual', 'temperatura'),
      this.variable('Humedad', this.clima?.humedad, '%', 'pi pi-percentage', 'HR ambiente', 'humedad'),
      this.variable('Lluvia', this.clima?.lluvia, 'mm', 'pi pi-cloud', 'Ultima lectura', 'lluvia'),
      this.variable('Viento', this.clima?.velocidadViento, 'km/h', 'pi pi-send', 'Velocidad', 'viento'),
      this.variable('Rafaga', this.clima?.rafagaViento, 'km/h', 'pi pi-bolt', 'Maxima reciente', 'rafaga'),
      this.variable('Direccion', this.clima?.direccionViento, 'deg', 'pi pi-compass', 'Sentido predominante', 'direccion'),
      this.variable('Radiacion', this.clima?.radiacionSolar, 'W/m2', 'pi pi-sparkles', 'Solar', 'radiacion'),
      this.variable('Presion', this.clima?.presion, 'hPa', 'pi pi-gauge', 'Atmosferica', 'presion'),
      this.variable('ET0', this.clima?.et0, 'mm', 'pi pi-chart-line', 'Referencia', 'et0'),
    ];
  }

  private variable(
    label: string,
    valores: IValores | undefined,
    unidad: string,
    icon: string,
    detail: string,
    key: string,
  ): VariableCentral {
    const value = this.leerValor(valores);
    return {
      key,
      label,
      value: value === undefined ? '--' : `${this.numeroAr.format(value)} ${unidad}`,
      detail,
      icon,
      disponible: value !== undefined,
      unit: unidad,
      historial: this.historialPorMetrica(key),
    };
  }

  private leerValor(valores?: IValores): number | undefined {
    const candidatos = [valores?.last, valores?.avg, valores?.max, valores?.sum, valores?.result];
    return candidatos.find((value): value is number => typeof value === 'number' && Number.isFinite(value));
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
    const key = this.keyLectura(lectura);
    return {
      key,
      label: this.traducirLabel(lectura.label),
      value: value === undefined ? '--' : `${this.numeroAr.format(value)}${unit}`,
      detail: this.detalleLectura(lectura),
      icon: this.iconoVariable(lectura.label),
      disponible: value !== undefined,
      unit: lectura.unit,
      historial: this.historialPorLectura(lectura),
    };
  }

  private variableDetalleDesdeSensor(
    sensor: IEstacionSensorDetalle,
  ): VariableCentral {
    return {
      key: this.keyLectura(sensor),
      label: this.traducirLabel(sensor.label),
      value: '--',
      detail: sensor.unit || sensor.nameOriginal || 'Sensor disponible',
      icon: this.iconoVariable(sensor.label),
      disponible: false,
      unit: sensor.unit,
      historial: this.historialPorLectura(sensor),
    };
  }

  private historialPorMetrica(key: string): SerieVariable[] {
    const matcher = this.matcherMetrica(key);
    return this.historialCentral()
      .filter((lectura) => matcher(this.normalizar(lectura.label), this.normalizar(lectura.nameOriginal || lectura.name || '')))
      .map((lectura) => this.puntoHistorico(lectura))
      .filter((punto): punto is SerieVariable => !!punto);
  }

  private historialPorLectura(sensor: IEstacionSensorDetalle): SerieVariable[] {
    const code = sensor.code;
    const ch = sensor.ch;
    const group = sensor.group;
    const label = this.normalizar(sensor.label);
    const name = this.normalizar(sensor.name || '');
    const nameOriginal = this.normalizar(sensor.nameOriginal || '');
    return this.historialCentral()
      .filter((lectura) => {
        if (code !== undefined && lectura.code !== undefined && code !== lectura.code) return false;
        if (ch !== undefined && lectura.ch !== undefined && ch !== lectura.ch) return false;
        if (group !== undefined && lectura.group !== undefined && group !== lectura.group) return false;
        const lecturaLabel = this.normalizar(lectura.label);
        const lecturaName = this.normalizar(lectura.name || '');
        const lecturaOriginal = this.normalizar(lectura.nameOriginal || '');
        return [lecturaLabel, lecturaName, lecturaOriginal].some((item) =>
          item && [label, name, nameOriginal].includes(item),
        );
      })
      .map((lectura) => this.puntoHistorico(lectura))
      .filter((punto): punto is SerieVariable => !!punto);
  }

  private historialCentral(): IEstacionLecturaHistorica[] {
    return this.central?.historialLecturas || [];
  }

  private puntoHistorico(lectura: IEstacionLecturaHistorica): SerieVariable | undefined {
    const value = this.leerValor(lectura);
    if (value === undefined || !lectura.fecha) {
      return undefined;
    }
    return { fecha: lectura.fecha, value };
  }

  private matcherMetrica(key: string): (label: string, original: string) => boolean {
    return (label, original) => {
      const texto = `${label} ${original}`;
      if (key === 'temperatura') return texto.includes('air temperature') || texto === 'temperature';
      if (key === 'humedad') return texto.includes('relative humidity') || texto === 'rh';
      if (key === 'lluvia') return texto.includes('precipitation') || texto.includes('rain');
      if (key === 'viento') return texto.includes('wind speed') && !texto.includes('gust');
      if (key === 'rafaga') return texto.includes('gust');
      if (key === 'direccion') return texto.includes('wind dir') || texto.includes('wind direction');
      if (key === 'radiacion') return texto.includes('solar radiation') || texto.includes('radiation');
      if (key === 'presion') return texto.includes('pressure');
      if (key === 'et0') return texto === 'et0' || texto.includes('daily et0');
      return false;
    };
  }

  private crearOpcionesGrafico(variable: VariableCentral): Highcharts.Options {
    const puntos = variable.historial
      .slice()
      .sort((a, b) => this.fechaToTime(a.fecha) - this.fechaToTime(b.fecha));
    return {
      chart: {
        backgroundColor: 'transparent',
        height: 360,
        spacing: [18, 18, 20, 12],
        type: 'spline',
        zooming: { type: 'x' },
        style: {
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
      },
      title: { text: undefined },
      xAxis: {
        categories: puntos.map((punto) => this.labelFechaGrafico(punto.fecha)),
        crosshair: { color: 'rgba(34, 211, 200, 0.24)', width: 1 },
        gridLineColor: 'rgba(119, 150, 180, 0.16)',
        gridLineWidth: 1,
        labels: {
          style: { color: 'var(--p-text-color)', fontSize: '12px', fontWeight: '650' },
        },
      },
      yAxis: {
        title: {
          text: variable.unit,
          style: { color: 'var(--p-text-color)', fontSize: '13px', fontWeight: '750' },
        },
        labels: {
          style: { color: 'var(--p-text-color)', fontSize: '12px' },
        },
        gridLineColor: 'rgba(119, 150, 180, 0.18)',
        gridLineWidth: 1,
      },
      legend: { enabled: false },
      tooltip: {
        backgroundColor: 'var(--p-content-background)',
        borderColor: 'var(--p-surface-border)',
        borderRadius: 8,
        borderWidth: 1,
        shadow: true,
        style: { color: 'var(--p-text-color)', fontSize: '13px' },
        valueDecimals: 2,
        valueSuffix: variable.unit ? ` ${variable.unit}` : '',
      },
      plotOptions: {
        spline: {
          animation: { duration: 450 },
          color: '#22d3c8',
          lineWidth: 2.4,
          marker: { enabled: true, radius: 2.8, states: { hover: { radius: 4.2 } } },
          states: { hover: { lineWidth: 3 } },
        },
        series: { turboThreshold: 0 },
      },
      series: [
        {
          data: puntos.map((punto) => punto.value),
          name: variable.label,
          type: 'spline',
        },
      ],
      credits: { enabled: false },
      accessibility: { enabled: false },
    };
  }

  private keyLectura(sensor: IEstacionSensorDetalle): string {
    return [
      sensor.label,
      sensor.code ?? '',
      sensor.ch ?? '',
      sensor.group ?? '',
    ].join('|');
  }

  private normalizar(value: string): string {
    return value.toLowerCase().trim();
  }

  private fechaUltimaLecturaCentral(): string | undefined {
    const fechas = (this.central?.ultimaLecturaDetalle || [])
      .map((lectura) => lectura.fecha)
      .filter((fecha): fecha is string => !!fecha);
    if (!fechas.length) {
      return this.central?.estado?.ultimoSync || this.clima?.fecha || this.establecimiento?.climaActual?.fecha;
    }
    return fechas.sort((a, b) => this.fechaToTime(b) - this.fechaToTime(a))[0];
  }

  private fechaToTime(fecha: string): number {
    const date = new Date(fecha);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  private labelFechaGrafico(fecha: string): string {
    const date = new Date(fecha);
    if (Number.isNaN(date.getTime())) return fecha;
    return date.toLocaleString('es-AR', {
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      month: '2-digit',
    });
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

  public get central(): IEstacion | undefined {
    return this.establecimiento?.estacionMeteorologica;
  }

  private get clima(): IClimaEstacionMeteorologica | undefined {
    return this.establecimiento?.climaActual?.clima;
  }
}
