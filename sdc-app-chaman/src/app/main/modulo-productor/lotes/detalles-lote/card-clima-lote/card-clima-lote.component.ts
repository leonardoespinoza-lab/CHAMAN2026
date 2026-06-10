import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { IClimaEstacionMeteorologica, IPronosticoEstacionMeteorologica } from 'modelos/src';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetallesLote } from '../detalles-lote.component';

interface MetricClima {
  label: string;
  value: string;
  detail: string;
  tone?: 'ok' | 'warn' | 'info';
}

interface DiaClima {
  fecha?: string;
  label: string;
  estado: string;
  temp: string;
  humedad: string;
  lluvia: string;
  probabilidad: string;
  viento: string;
  et0: string;
  vpd: string;
  lluviaPct: number;
  humedadPct: number;
}

interface SerieClima {
  label: string;
  color: string;
  valores: number[];
  path: string;
  puntos: PuntoClima[];
}

interface PuntoClima {
  x: number;
  y: number;
  valor: number;
  etiqueta: string;
}

interface PanelClima {
  titulo: string;
  subtitulo: string;
  tipo: 'line' | 'bar';
  series: SerieClima[];
}

@Component({
  selector: 'app-card-clima-lote',
  imports: [CommonModule, SharedModule],
  templateUrl: './card-clima-lote.component.html',
  styleUrl: './card-clima-lote.component.scss',
})
export class CardClimaLoteComponent {
  @Input() public lote?: IDetallesLote;

  public get pronosticos(): IPronosticoEstacionMeteorologica[] {
    return this.lote?.establecimiento?.prediccionClimatica?.pronosticos?.slice(0, 7) || [];
  }

  public get climaActual(): IClimaEstacionMeteorologica | undefined {
    return this.lote?.establecimiento?.climaActual?.clima;
  }

  public get fuente(): string {
    return this.pronosticos[0]?.fuente || this.climaActual?.fuente || 'Open-Meteo';
  }

  public get metricas(): MetricClima[] {
    const lluvia24 = this.lluvias[0] || 0;
    const lluvia72 = this.suma(this.lluvias.slice(0, 3));
    const et072 = this.suma(this.et0s.slice(0, 3));
    const balance = this.redondear(lluvia72 - et072);
    const humedadMax72 = this.max(this.humedadesMax.slice(0, 3));
    const probLluvia = this.max(this.probabilidadesLluvia);
    const vpdMax72 = this.max(this.vpds.slice(0, 3));
    const vientoMax72 = this.max(this.vientos.slice(0, 3));

    return [
      { label: 'Lluvia 24 h', value: this.formatear(lluvia24, 'mm'), detail: 'Proximo dia', tone: lluvia24 > 0 ? 'info' : 'ok' },
      { label: 'Lluvia 72 h', value: this.formatear(lluvia72, 'mm'), detail: 'Ventana enfermedades', tone: lluvia72 > 4 ? 'warn' : 'ok' },
      { label: 'HR max 72 h', value: this.formatear(humedadMax72, '%'), detail: 'Mojado foliar probable', tone: humedadMax72 > 92 ? 'warn' : 'ok' },
      { label: 'ET0 72 h', value: this.formatear(et072, 'mm'), detail: 'Demanda atmosferica', tone: 'info' },
      { label: 'Balance 72 h', value: this.formatear(balance, 'mm'), detail: 'Lluvia menos ET0', tone: balance < -2 ? 'warn' : 'ok' },
      { label: 'Prob. lluvia', value: this.formatear(probLluvia, '%'), detail: 'Maxima diaria', tone: probLluvia > 60 ? 'warn' : 'ok' },
      { label: 'VPD max', value: this.formatear(vpdMax72, 'kPa'), detail: 'Secado del ambiente', tone: vpdMax72 > 1.2 ? 'warn' : 'ok' },
      { label: 'Viento max', value: this.formatear(vientoMax72, 'km/h'), detail: 'Aireacion / aplicaciones', tone: vientoMax72 > 25 ? 'warn' : 'info' },
    ];
  }

  public get dias(): DiaClima[] {
    const lluviaMax = Math.max(...this.lluvias, 1);

    return this.pronosticos.map((p, index) => {
      const tempMax = this.numero(p.temperatura?.max);
      const tempMin = this.numero(p.temperatura?.min);
      const humedad = this.numero(p.humedad?.max ?? p.humedad?.avg) || 0;
      const lluvia = this.numero(p.lluvia) || 0;
      const probabilidad = this.numero(p.probabilidadLluvia) || 0;
      const vpd = this.calcularVpd(this.numero(p.temperatura?.avg ?? p.temperatura?.max), this.numero(p.humedad?.avg ?? p.humedad?.max));

      return {
        fecha: p.fecha,
        label: index === 0 ? 'Hoy' : this.nombreDia(p.fecha),
        estado: this.estadoDia(humedad, lluvia, probabilidad),
        temp: `${this.valor(tempMin)} / ${this.valor(tempMax)} C`,
        humedad: this.formatear(humedad, '%'),
        lluvia: this.formatear(lluvia, 'mm'),
        probabilidad: this.formatear(probabilidad, '%'),
        viento: this.formatear(this.numero(p.velocidadViento?.max ?? p.velocidadViento?.avg), 'km/h'),
        et0: this.formatear(this.numero(p.et0), 'mm'),
        vpd: this.formatear(vpd, 'kPa'),
        lluviaPct: Math.max(4, (lluvia / lluviaMax) * 100),
        humedadPct: Math.max(4, humedad),
      };
    });
  }

  public get paneles(): PanelClima[] {
    const puntoRocio = this.pronosticos.map((p) =>
      this.calcularPuntoRocio(this.numero(p.temperatura?.avg ?? p.temperatura?.max), this.numero(p.humedad?.avg ?? p.humedad?.max)),
    );

    const paneles: PanelClima[] = [
      {
        titulo: 'Temperatura',
        subtitulo: 'Media y punto de rocio',
        tipo: 'line',
        series: [
          this.crearSerie('Temp C', '#23c8c4', this.temperaturas),
          this.crearSerie('Punto rocio C', '#7f8ea3', puntoRocio),
        ],
      },
      {
        titulo: 'Lluvia',
        subtitulo: 'mm por dia',
        tipo: 'bar',
        series: [this.crearSerie('Lluvia mm', '#6aa84f', this.lluvias)],
      },
      {
        titulo: 'Humedad',
        subtitulo: 'HR maxima diaria',
        tipo: 'line',
        series: [this.crearSerie('HR %', '#5c7cfa', this.humedadesMax)],
      },
      {
        titulo: 'ET0 y VPD',
        subtitulo: 'Demanda atmosferica',
        tipo: 'line',
        series: [
          this.crearSerie('ET0 mm', '#f4a340', this.et0s),
          this.crearSerie('VPD kPa', '#e05d4f', this.vpds),
        ],
      },
    ];

    return paneles.filter((panel) => panel.series.some((serie) => serie.valores.length > 1));
  }

  public barraAltura(valor: number, valores: number[]): number {
    const max = Math.max(...valores, 1);
    return Math.max(5, (valor / max) * 100);
  }

  private get temperaturas(): number[] {
    return this.pronosticos
      .map((p) => this.numero(p.temperatura?.avg ?? p.temperatura?.max))
      .filter((value): value is number => value !== null);
  }

  private get humedadesMax(): number[] {
    return this.pronosticos
      .map((p) => this.numero(p.humedad?.max ?? p.humedad?.avg))
      .filter((value): value is number => value !== null);
  }

  private get lluvias(): number[] {
    return this.pronosticos.map((p) => this.numero(p.lluvia) || 0);
  }

  private get vientos(): number[] {
    return this.pronosticos.map((p) => this.numero(p.velocidadViento?.max ?? p.velocidadViento?.avg) || 0);
  }

  private get et0s(): number[] {
    return this.pronosticos.map((p) => this.numero(p.et0) || 0);
  }

  private get probabilidadesLluvia(): number[] {
    return this.pronosticos.map((p) => this.numero(p.probabilidadLluvia) || 0);
  }

  private get vpds(): number[] {
    return this.pronosticos
      .map((p) => this.calcularVpd(this.numero(p.temperatura?.avg ?? p.temperatura?.max), this.numero(p.humedad?.avg ?? p.humedad?.max)))
      .filter((value): value is number => value !== null);
  }

  private crearSerie(label: string, color: string, valores: Array<number | null>): SerieClima {
    const clean = valores.filter((value): value is number => value !== null).map((v) => this.redondear(v));
    const puntos = this.crearPuntos(clean);
    return {
      label,
      color,
      valores: clean,
      path: this.crearPath(puntos),
      puntos,
    };
  }

  private crearPuntos(valores: number[]): PuntoClima[] {
    if (!valores.length) {
      return [];
    }
    const width = 220;
    const height = 68;
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    const range = Math.max(max - min, 1);

    return valores.map((valor, index) => ({
      x: valores.length === 1 ? width / 2 : (index / (valores.length - 1)) * width,
      y: height - ((valor - min) / range) * (height - 10) - 5,
      valor,
      etiqueta: this.dias[index]?.label || `Dia ${index + 1}`,
    }));
  }

  private crearPath(puntos: PuntoClima[]): string {
    if (puntos.length < 2) {
      return '';
    }
    return puntos
      .map((punto, index) => `${index === 0 ? 'M' : 'L'} ${punto.x.toFixed(1)} ${punto.y.toFixed(1)}`)
      .join(' ');
  }

  private calcularPuntoRocio(temp?: number | null, humedad?: number | null): number | null {
    if (temp == null || humedad == null || humedad <= 0) {
      return null;
    }
    const a = 17.27;
    const b = 237.7;
    const alpha = (a * temp) / (b + temp) + Math.log(humedad / 100);
    return this.redondear((b * alpha) / (a - alpha));
  }

  private calcularVpd(temp?: number | null, humedad?: number | null): number | null {
    if (temp == null || humedad == null) {
      return null;
    }
    const svp = 0.6108 * Math.exp((17.27 * temp) / (temp + 237.3));
    return this.redondear(svp * (1 - humedad / 100));
  }

  private estadoDia(humedad: number, lluvia: number, probabilidad: number): string {
    if (lluvia > 3 || probabilidad >= 70) return 'Lluvia probable';
    if (humedad >= 94) return 'Alta humedad';
    if (humedad >= 86) return 'Monitorear';
    return 'Estable';
  }

  private nombreDia(fecha?: string): string {
    if (!fecha) return '-';
    return new Date(fecha).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' });
  }

  private formatear(value: number | null, unit: string): string {
    if (value === null || Number.isNaN(value)) {
      return 'N/A';
    }
    return `${value} ${unit}`;
  }

  private valor(value: number | null): string {
    return value === null || Number.isNaN(value) ? '-' : `${value}`;
  }

  private suma(values: number[]): number {
    return this.redondear(values.reduce((acc, value) => acc + value, 0));
  }

  private max(values: number[]): number {
    return this.redondear(Math.max(...values, 0));
  }

  private numero(value: unknown): number | null {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return null;
    }
    return this.redondear(value);
  }

  private redondear(value: number): number {
    return Math.round(value * 10) / 10;
  }
}
