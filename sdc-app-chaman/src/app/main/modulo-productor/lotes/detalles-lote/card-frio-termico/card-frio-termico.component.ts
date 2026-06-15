import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import {
  esCultivoPerenne,
  IFrioTermicoCultivo,
  ISerieFrioTermicoDia,
  ISiembra,
} from 'modelos/src';
import { ClimaService } from '../../../../../auxiliares/http/clima.service';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetallesLote } from '../detalles-lote.component';

interface MetricFrio {
  label: string;
  value: string;
  detail: string;
  pct?: number;
  tone?: 'ok' | 'warn' | 'info';
}

interface SeriePath {
  label: string;
  color: string;
  path: string;
  puntos: Array<{ x: number; y: number; valor: number; fecha: string }>;
}

@Component({
  selector: 'app-card-frio-termico',
  imports: [CommonModule, SharedModule],
  templateUrl: './card-frio-termico.component.html',
  styleUrl: './card-frio-termico.component.scss',
})
export class CardFrioTermicoComponent implements OnChanges {
  @Input() public lote?: IDetallesLote;
  @Input() public siembra?: ISiembra;

  public loading = false;
  public data?: IFrioTermicoCultivo;
  public error?: string;

  constructor(private climaService: ClimaService) {}

  public get mostrar(): boolean {
    return esCultivoPerenne(this.siembra?.semilla?.cultivo);
  }

  public get metricas(): MetricFrio[] {
    if (!this.data) return [];
    return [
      {
        label: 'Horas frio',
        value: `${this.data.acumulados.horasFrio} h`,
        detail: `Objetivo ${this.data.requerimientos.horasFrioObjetivo || '-'} h`,
        pct: this.data.progreso.horasFrioPct,
        tone: this.data.progreso.horasFrioPct >= 85 ? 'ok' : 'info',
      },
      {
        label: 'Frio efectivo',
        value: `${this.data.acumulados.horasFrioEfectivas} h`,
        detail: `Objetivo ${this.data.requerimientos.horasFrioEfectivasObjetivo || '-'} h`,
        pct: this.data.progreso.horasFrioEfectivasPct,
        tone: this.data.progreso.horasFrioEfectivasPct >= 85 ? 'ok' : 'info',
      },
      {
        label: 'Porciones frio',
        value: `${this.data.acumulados.porcionesFrio}`,
        detail: `Objetivo ${this.data.requerimientos.porcionesFrioObjetivo || '-'}`,
        pct: this.data.progreso.porcionesFrioPct,
        tone: this.data.progreso.porcionesFrioPct >= 85 ? 'ok' : 'info',
      },
      {
        label: 'Grados dia',
        value: `${this.data.acumulados.gradosDia} GD`,
        detail: `Base ${this.data.requerimientos.temperaturaBaseGradosDia || 10} C`,
        pct: this.data.progreso.brotacionPct,
        tone: this.data.progreso.brotacionPct >= 80 ? 'warn' : 'info',
      },
      {
        label: 'Riesgo helada',
        value: this.data.riesgoHelada.nivel.toUpperCase(),
        detail: this.data.riesgoHelada.fechaCritica
          ? `${this.data.riesgoHelada.fechaCritica} / ${this.data.riesgoHelada.temperaturaMinima} C`
          : 'Sin alerta inmediata',
        tone: this.data.riesgoHelada.nivel === 'bajo' ? 'ok' : 'warn',
      },
    ];
  }

  public get seriesTemperatura(): SeriePath[] {
    const serie = this.serieReciente;
    return [
      this.crearPath('Temp min', '#2d9bf0', serie.map((dia) => dia.temperaturaMin), serie),
      this.crearPath('Temp max', '#f0524a', serie.map((dia) => dia.temperaturaMax), serie),
    ].filter((item) => item.path);
  }

  public get serieReciente(): ISerieFrioTermicoDia[] {
    return (this.data?.serie || []).slice(-60);
  }

  public get lluviaMaxima(): number {
    return Math.max(...this.serieReciente.map((dia) => dia.lluvia || 0), 1);
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['lote'] || changes['siembra']) {
      await this.cargar();
    }
  }

  public async cargar(): Promise<void> {
    if (!this.mostrar) return;
    const centro = this.lote?.ubicacion?.centro || this.lote?.establecimiento?.ubicacion?.[0]?.centro;
    if (!centro?.lat || !centro?.lng) {
      this.error = 'Sin coordenadas para calcular frio y grados dia.';
      return;
    }

    this.loading = true;
    this.error = undefined;
    try {
      const requerimientoFrio = this.siembra?.semilla?.requerimientoFrio || {};
      this.data = await this.climaService.getFrioTermico(centro.lat, centro.lng, {
        cultivo: this.siembra?.semilla?.cultivo,
        horasFrioObjetivo: requerimientoFrio.horasFrio,
        horasFrioEfectivasObjetivo: requerimientoFrio.horasFrioEfectivas,
        porcionesFrioObjetivo: requerimientoFrio.porcionesFrio,
      });
    } catch (error: any) {
      this.error = error?.error?.message || error?.message || 'No se pudo calcular frio termico.';
    } finally {
      this.loading = false;
    }
  }

  public barraLluvia(dia: ISerieFrioTermicoDia): number {
    return Math.max(2, ((dia.lluvia || 0) / this.lluviaMaxima) * 100);
  }

  public anchoBarraLluvia(): number {
    return Math.max(2, 320 / Math.max(this.serieReciente.length, 1) - 2);
  }

  private crearPath(
    label: string,
    color: string,
    valores: Array<number | undefined>,
    serie: ISerieFrioTermicoDia[],
  ): SeriePath {
    const puntosBase = valores
      .map((valor, index) => ({ valor, index }))
      .filter((item): item is { valor: number; index: number } => typeof item.valor === 'number');
    if (puntosBase.length < 2) {
      return { label, color, path: '', puntos: [] };
    }

    const width = 320;
    const height = 96;
    const min = Math.min(...puntosBase.map((item) => item.valor));
    const max = Math.max(...puntosBase.map((item) => item.valor));
    const range = Math.max(max - min, 1);
    const puntos = puntosBase.map((item) => ({
      x: puntosBase.length === 1 ? width / 2 : (item.index / Math.max(serie.length - 1, 1)) * width,
      y: height - ((item.valor - min) / range) * (height - 14) - 7,
      valor: item.valor,
      fecha: serie[item.index]?.fecha || '',
    }));
    return {
      label,
      color,
      puntos,
      path: puntos.map((punto, index) => `${index === 0 ? 'M' : 'L'} ${punto.x.toFixed(1)} ${punto.y.toFixed(1)}`).join(' '),
    };
  }
}
