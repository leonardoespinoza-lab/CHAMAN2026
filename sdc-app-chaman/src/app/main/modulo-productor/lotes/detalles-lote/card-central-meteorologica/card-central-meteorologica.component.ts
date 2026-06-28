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

type VariableCanonica =
  | 'temperatura'
  | 'humedad'
  | 'lluvia'
  | 'viento'
  | 'rafaga'
  | 'direccion'
  | 'radiacion'
  | 'presion'
  | 'et0';

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
    this.chartOptions = undefined;
    this.graficoVisible = true;
    setTimeout(() => {
      this.chartOptions = this.crearOpcionesGrafico(variable);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
    });
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
    unidadFallback: string,
    icon: string,
    detail: string,
    key: string,
  ): VariableCentral {
    const lecturaCanonica = this.lecturaCanonica(key as VariableCanonica);
    const value = this.leerValor(lecturaCanonica) ?? this.leerValor(valores);
    const unidad = lecturaCanonica?.unit || unidadFallback;
    return {
      key,
      label,
      value: value === undefined ? '--' : `${this.numeroAr.format(value)} ${unidad}`,
      detail,
      icon,
      disponible: value !== undefined,
      unit: unidad,
      historial: this.historialPorMetrica(key, lecturaCanonica),
    };
  }

  private leerValor(valores?: IValores): number | undefined {
    const candidatos = [valores?.last, valores?.avg, valores?.max, valores?.sum, valores?.result];
    return candidatos.find((value): value is number => typeof value === 'number' && Number.isFinite(value));
  }

  private crearVariablesDetalle(): VariableCentral[] {
    const lecturas = this.central?.ultimaLecturaDetalle || [];
    if (lecturas.length) {
      const variables = lecturas.map((lectura) => this.variableDetalleDesdeLectura(lectura));
      return this.deduplicarVariablesDetalle(variables).filter((variable) => this.mostrarVariableDetalle(variable));
    }
    const sensores = this.central?.sensoresDetalle || [];
    const variables = sensores.map((sensor) => this.variableDetalleDesdeSensor(sensor));
    return this.deduplicarVariablesDetalle(variables).filter((variable) => this.mostrarVariableDetalle(variable));
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

  private historialPorMetrica(key: string, lecturaCanonica?: IEstacionLecturaDetalle): SerieVariable[] {
    if (lecturaCanonica) {
      return this.historialPorLectura(lecturaCanonica);
    }
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

  private lecturaCanonica(key: VariableCanonica): IEstacionLecturaDetalle | undefined {
    const lecturas = this.central?.ultimaLecturaDetalle || [];
    return lecturas
      .filter((lectura) => this.keyResumenDesdeTexto(this.textoLectura(lectura)) === key)
      .sort((a, b) => this.prioridadLecturaCanonica(key, b) - this.prioridadLecturaCanonica(key, a))[0];
  }

  private textoLectura(lectura: IEstacionSensorDetalle): string {
    return this.normalizar([
      lectura.label,
      lectura.name,
      lectura.nameOriginal,
      lectura.type,
    ].filter(Boolean).join(' '));
  }

  private prioridadLecturaCanonica(key: VariableCanonica, lectura: IEstacionLecturaDetalle): number {
    const texto = this.textoLectura(lectura);
    let prioridad = this.leerValor(lectura) !== undefined ? 20 : 0;
    if (key === 'temperatura') {
      if (texto.includes('air temperature') || texto.includes('temperatura del aire')) prioridad += 10;
      else if (texto.includes('temperature') && !texto.includes('i2c') && !texto.includes('soil')) prioridad += 6;
      else if (texto.includes('i2c temperature')) prioridad += 1;
    }
    if (key === 'humedad' && (texto.includes('relative humidity') || texto.includes('humedad relativa'))) prioridad += 10;
    if (key === 'lluvia' && (texto.includes('precipitation') || texto.includes('precipitacion'))) prioridad += 10;
    if (key === 'viento' && texto.includes('wind speed')) prioridad += 10;
    if (key === 'rafaga' && (texto.includes('gust') || texto.includes('rafaga'))) prioridad += 10;
    if (key === 'direccion' && (texto.includes('wind dir') || texto.includes('direccion viento'))) prioridad += 10;
    if (key === 'radiacion' && (texto.includes('solar radiation') || texto.includes('radiacion solar'))) prioridad += 10;
    if (key === 'presion' && (texto.includes('pressure') || texto.includes('presion'))) prioridad += 10;
    if (key === 'et0' && texto.includes('et0')) prioridad += 10;
    return prioridad;
  }

  private deduplicarVariablesDetalle(variables: VariableCentral[]): VariableCentral[] {
    const vistas = new Set<string>();
    return variables.filter((variable) => {
      const claveCanonica = this.keyResumenDesdeTexto(variable.label);
      const clave = claveCanonica || `${this.normalizar(variable.label)}|${variable.unit || ''}`;
      if (vistas.has(clave)) {
        return false;
      }
      vistas.add(clave);
      return true;
    });
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
      if (key === 'temperatura') return texto.includes('air temperature') || texto.includes('i2c temperature') || texto === 'temperature';
      if (key === 'humedad') return texto.includes('relative humidity') || texto.includes('rel humidity') || texto === 'rh';
      if (key === 'lluvia') return texto.includes('precipitation') || texto.includes('rain');
      if (key === 'viento') return texto.includes('wind speed') && !texto.includes('gust');
      if (key === 'rafaga') return texto.includes('gust');
      if (key === 'direccion') return texto.includes('wind dir') || texto.includes('wind direction') || texto.includes('wind orientation');
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
    const data = puntos.map((punto) => [this.fechaToTime(punto.fecha), punto.value] as [number, number]);
    return {
      time: {
        useUTC: false,
      },
      chart: {
        reflow: true,
        spacing: [16, 18, 18, 12],
        type: 'spline',
        zooming: { type: 'x' },
      },
      title: { text: undefined },
      xAxis: {
        type: 'datetime',
      },
      yAxis: {
        title: {
          text: variable.unit,
        },
      },
      legend: { enabled: false },
      tooltip: {
        xDateFormat: '%d/%m/%Y %H:%M',
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
          data,
          name: variable.label,
          type: 'spline',
        },
      ],
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

  private mostrarVariableDetalle(variable: VariableCentral): boolean {
    const label = this.normalizar(variable.label);
    if (this.esVariableTecnica(label)) {
      return false;
    }

    const resumenKey = this.keyResumenDesdeTexto(label);
    if (!resumenKey) {
      return true;
    }

    const resumenTieneDato = this.variables.some((item) => item.key === resumenKey && item.disponible);
    return !resumenTieneDato;
  }

  private esVariableTecnica(label: string): boolean {
    return (
      label.includes('firmware') ||
      label.includes('hardware') ||
      label.includes('identifier') ||
      label === 'sunrise' ||
      label === 'sunset' ||
      label === 'midnight'
    );
  }

  private keyResumenDesdeTexto(texto: string): string | undefined {
    const normalizado = this.normalizar(texto);
    if (
      normalizado.includes('air temperature') ||
      normalizado.includes('i2c temperature') ||
      normalizado.includes('temperatura del aire') ||
      normalizado === 'temperatura'
    ) return 'temperatura';
    if (
      normalizado.includes('relative humidity') ||
      normalizado.includes('rel humidity') ||
      normalizado.includes('humedad relativa') ||
      normalizado === 'humedad'
    ) return 'humedad';
    if (
      normalizado.includes('precipitation') ||
      normalizado.includes('precipitacion') ||
      normalizado.includes('rain') ||
      normalizado === 'lluvia'
    ) return 'lluvia';
    if (
      (normalizado.includes('wind speed') || normalizado.includes('velocidad viento')) &&
      !normalizado.includes('gust') &&
      !normalizado.includes('rafaga')
    ) return 'viento';
    if (normalizado.includes('gust') || normalizado.includes('rafaga')) return 'rafaga';
    if (
      normalizado.includes('wind dir') ||
      normalizado.includes('wind direction') ||
      normalizado.includes('wind orientation') ||
      normalizado.includes('direccion viento') ||
      normalizado === 'direccion'
    ) return 'direccion';
    if (
      normalizado.includes('solar radiation') ||
      normalizado.includes('radiacion solar') ||
      normalizado === 'radiacion'
    ) return 'radiacion';
    if (normalizado.includes('pressure') || normalizado.includes('presion')) return 'presion';
    if (normalizado === 'et0' || normalizado.includes('daily et0')) return 'et0';
    return undefined;
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
    if (normalizado.includes('i2c temperature')) return 'Temperatura del aire';
    if (normalizado.includes('dew point')) return 'Punto de rocio';
    if (normalizado.includes('relative humidity')) return 'Humedad relativa';
    if (normalizado.includes('rel humidity')) return 'Humedad relativa';
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
