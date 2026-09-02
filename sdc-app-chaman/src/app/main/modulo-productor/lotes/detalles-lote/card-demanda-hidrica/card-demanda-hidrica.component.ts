import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import {
  CULTIVOS_DISPONIBLES,
  Cultivo,
  evaluarDemandaHidricaHora,
  EstadoEstomaticoEstimado,
  IEstadoDemandaHidricaHora,
  IRespuestaAgrometeorologiaSiembra,
  ISiembra,
  NivelDemandaHidricaHoraria,
  resumirVentanasAperturaEstomatica,
} from 'modelos/src';
import { SiembraService } from '../../../../../auxiliares/http/siembra.service';
import { SharedModule } from '../../../../../auxiliares/shared.module';

interface IVentanaEstomatica {
  durationHours: number;
  periodsLabel: string;
}

@Component({
  selector: 'app-card-demanda-hidrica',
  imports: [CommonModule, SharedModule],
  templateUrl: './card-demanda-hidrica.component.html',
  styleUrl: './card-demanda-hidrica.component.scss',
})
export class CardDemandaHidricaComponent implements OnChanges {
  private static readonly cache = new Map<string, IRespuestaAgrometeorologiaSiembra>();
  private static readonly pending = new Map<string, Promise<IRespuestaAgrometeorologiaSiembra>>();
  private static readonly imagePreloads = new Map<string, HTMLImageElement>();

  @Input() public siembra?: ISiembra;

  public loading = false;
  public error?: string;
  public response?: IRespuestaAgrometeorologiaSiembra;
  public hours: IEstadoDemandaHidricaHora[] = [];
  public selected?: IEstadoDemandaHidricaHora;

  constructor(private siembraService: SiembraService) {}

  public get mostrar(): boolean {
    return !!this.crop && !!this.siembra?._id && !this.siembra?.fechaCosecha;
  }

  public get crop(): Cultivo | undefined {
    const value = this.siembra?.semilla?.cultivo;
    return (CULTIVOS_DISPONIBLES as readonly string[]).includes(String(value)) ? (value as Cultivo) : undefined;
  }

  public get imageUrl(): string {
    return `/images/water-demand/${this.normalizar(this.crop)}.webp`;
  }

  public get imageFallbackUrl(): string {
    return `/images/water-demand/${this.normalizar(this.crop)}.png`;
  }

  public get title(): string {
    return this.crop ? `Estado hidrico horario · ${this.crop}` : 'Estado hidrico horario';
  }

  public get levelLabel(): string {
    const labels: Record<NivelDemandaHidricaHoraria, string> = {
      low: 'Demanda baja',
      expected: 'Rango esperado',
      high: 'Demanda alta',
      very_high: 'Demanda muy alta',
      night: 'Periodo nocturno',
      not_evaluated: 'Fuera de evaluacion',
      no_data: 'Dato incompleto',
    };
    return labels[this.selected?.level || 'no_data'];
  }

  public get periodLabel(): string {
    const labels: Record<EstadoEstomaticoEstimado, string> = {
      open: 'Apertura estomatica probable',
      regulated: 'Regulacion estomatica probable',
      closed: 'Estomas probablemente cerrados',
      not_evaluated: 'Etapa fuera de evaluacion',
      no_data: 'Estado estomatico sin evaluar',
    };
    return labels[this.selected?.stomatalState || 'no_data'];
  }

  public get stageLabel(): string {
    return this.selected?.stage || 'Etapa sin confirmar';
  }

  public get stomatalWindow(): IVentanaEstomatica {
    const windows = resumirVentanasAperturaEstomatica(this.hours);
    if (!windows.length) {
      return { durationHours: 0, periodsLabel: 'Sin ventana favorable' };
    }
    return {
      durationHours: windows.reduce((total, window) => total + window.durationHours, 0),
      periodsLabel: windows
        .map(
          (window) =>
            `${this.timeLabel(window.desde, window.timezone)}–${this.timeLabel(window.hasta, window.timezone)}`
        )
        .join(' · '),
    };
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['siembra']) {
      this.preloadImage();
      void this.cargar();
    }
  }

  public selectHour(hour: IEstadoDemandaHidricaHora): void {
    this.selected = hour;
  }

  public async cargar(force = false): Promise<void> {
    const id = this.siembra?._id;
    if (!id || !this.crop) {
      this.reset();
      return;
    }
    const key = `${id}|${new Date().toISOString().slice(0, 10)}`;
    const cached = CardDemandaHidricaComponent.cache.get(key);
    if (!force && cached) {
      this.aplicar(cached);
      return;
    }
    const active = CardDemandaHidricaComponent.pending.get(key);
    if (!force && active) {
      this.loading = true;
      try {
        this.aplicar(await active);
      } catch {
        this.error = 'No se pudo recuperar la lectura horaria en este momento.';
      } finally {
        this.loading = false;
      }
      return;
    }

    this.loading = true;
    this.error = undefined;
    try {
      const today = new Date();
      const from = this.isoDate(new Date(today.getTime() - 24 * 3600000));
      const to = this.isoDate(new Date(today.getTime() + 48 * 3600000));
      const request = this.siembraService.agrometeorologia(id, from, to, true);
      CardDemandaHidricaComponent.pending.set(key, request);
      const response = await request;
      CardDemandaHidricaComponent.cache.set(key, response);
      this.aplicar(response);
    } catch {
      this.error = 'No se pudo recuperar la lectura horaria en este momento.';
      this.hours = [];
      this.selected = undefined;
    } finally {
      CardDemandaHidricaComponent.pending.delete(key);
      this.loading = false;
    }
  }

  public hourLabel(hour: IEstadoDemandaHidricaHora): string {
    return this.timeLabel(hour.timestamp, hour.timezone);
  }

  private timeLabel(timestamp: string, timezone: string): string {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleTimeString('es-AR', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  public dateLabel(hour?: IEstadoDemandaHidricaHora): string {
    if (!hour) return '';
    const date = new Date(hour.timestamp);
    if (Number.isNaN(date.getTime())) return hour.localDate;
    return date.toLocaleDateString('es-AR', {
      timeZone: hour.timezone,
      day: '2-digit',
      month: 'short',
    });
  }

  public levelClass(level?: NivelDemandaHidricaHoraria): string {
    return `level-${level || 'no_data'}`;
  }

  public observationLabel(hour?: IEstadoDemandaHidricaHora): string {
    return hour?.isForecast ? 'Pronostico' : 'Observado';
  }

  private aplicar(response: IRespuestaAgrometeorologiaSiembra): void {
    this.response = response;
    this.error = undefined;
    const crop = this.crop;
    if (!crop) return this.reset();
    const days = new Map(response.series.map((day) => [day.date, day]));
    const states = (response.hourlySeries || []).map((hour) =>
      evaluarDemandaHidricaHora(hour, crop, days.get(hour.localDate))
    );
    if (!states.length) {
      this.hours = [];
      this.selected = undefined;
      return;
    }
    const now = Date.now();
    const latestObserved = [...states]
      .filter((hour) => !hour.isForecast && new Date(hour.timestamp).getTime() <= now)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
    this.selected = latestObserved || states[0];
    const targetDate = this.selected.localDate;
    const sameDate = states.filter((hour) => hour.localDate === targetDate);
    this.hours = (sameDate.length ? sameDate : states.slice(-24)).slice(0, 24);
  }

  private reset(): void {
    this.response = undefined;
    this.hours = [];
    this.selected = undefined;
    this.error = undefined;
  }

  private preloadImage(): void {
    if (!this.crop || typeof Image === 'undefined') return;
    const url = this.imageUrl;
    if (CardDemandaHidricaComponent.imagePreloads.has(url)) return;
    const image = new Image();
    image.decoding = 'async';
    image.fetchPriority = 'high';
    image.src = url;
    CardDemandaHidricaComponent.imagePreloads.set(url, image);
  }

  private isoDate(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private normalizar(value?: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }
}
