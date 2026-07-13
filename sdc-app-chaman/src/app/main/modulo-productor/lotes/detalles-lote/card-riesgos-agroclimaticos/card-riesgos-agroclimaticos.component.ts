import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { IRiesgoAgroclimatico, IResumenRiesgosAgroclimaticos, ISiembra } from 'modelos/src';
import { ClimaService } from '../../../../../auxiliares/http/clima.service';
import { PrediccionService } from '../../../../../auxiliares/http/prediccion.service';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetallesLote } from '../detalles-lote.component';

@Component({
  selector: 'app-card-riesgos-agroclimaticos',
  imports: [CommonModule, SharedModule],
  templateUrl: './card-riesgos-agroclimaticos.component.html',
  styleUrl: './card-riesgos-agroclimaticos.component.scss',
})
export class CardRiesgosAgroclimaticosComponent implements OnChanges {
  private static readonly cache = new Map<string, IResumenRiesgosAgroclimaticos>();
  private static readonly pending = new Map<string, Promise<IResumenRiesgosAgroclimaticos>>();

  @Input() public lote?: IDetallesLote;
  @Input() public siembra?: ISiembra;

  public loading = false;
  public error?: string;
  public riesgos?: IResumenRiesgosAgroclimaticos;
  public riesgoSeleccionado?: IRiesgoAgroclimatico;
  public verDetalle = false;

  private ultimoKey = '';

  constructor(
    private climaService: ClimaService,
    private prediccionService: PrediccionService
  ) {}

  public get mostrar(): boolean {
    return !!this.centro && !!this.siembra?.semilla?.cultivo && !this.siembra?.fechaCosecha;
  }

  public get items(): IRiesgoAgroclimatico[] {
    const riesgos = this.riesgos;
    if (!riesgos) return [];
    return [riesgos.helada, riesgos.granizo].filter((item): item is IRiesgoAgroclimatico => !!item && item.aplica);
  }

  public get resumen(): string {
    if (!this.items.length) return 'Pronostico operativo por lote.';
    const mayor = [...this.items].sort((a, b) => b.posibilidadPct - a.posibilidadPct)[0];
    return `${mayor.titulo}: ${mayor.nivel} (${mayor.posibilidadPct}%).`;
  }

  public abrirDetalle(riesgo: IRiesgoAgroclimatico): void {
    this.riesgoSeleccionado = riesgo;
    this.verDetalle = true;
  }

  public cerrarDetalle(): void {
    this.riesgoSeleccionado = undefined;
    this.verDetalle = false;
  }

  public async cargar(force = false): Promise<void> {
    if (!this.mostrar || !this.centro) {
      this.riesgos = undefined;
      return;
    }

    const key = this.requestKey();
    if (!force && key === this.ultimoKey && this.riesgos) return;

    const cached = CardRiesgosAgroclimaticosComponent.cache.get(key);
    if (!force && cached) {
      this.riesgos = cached;
      this.ultimoKey = key;
      return;
    }

    const pending = CardRiesgosAgroclimaticosComponent.pending.get(key);
    if (!force && pending) {
      this.loading = !this.riesgos;
      try {
        this.riesgos = await pending;
        this.ultimoKey = key;
      } catch (error: any) {
        this.error = error?.error?.message || error?.message || 'No se pudo calcular riesgos agroclimaticos.';
      } finally {
        this.loading = false;
      }
      return;
    }

    this.loading = true;
    this.error = undefined;
    try {
      const request = this.siembra?._id
        ? this.prediccionService.listarRiesgosAgroclimaticos(this.siembra._id)
        : this.climaService.getRiesgosAgroclimaticos(this.centro.lat, this.centro.lng, {
            cultivo: this.siembra?.semilla?.cultivo,
            variedad: this.siembra?.semilla?.variedad,
            fechaSiembra: this.siembra?.fechaSiembra,
            edadProductivaDesdeAnios: this.siembra?.semilla?.fenologiaReferencia?.edadProductivaDesdeAnios,
            ajusteHeladaC: this.siembra?.semilla?.sensibilidadHelada?.ajusteUmbralC,
            fuenteAjusteVarietal: this.siembra?.semilla?.sensibilidadHelada?.fuente,
          });
      CardRiesgosAgroclimaticosComponent.pending.set(key, request);
      this.riesgos = await request;
      this.ultimoKey = key;
      CardRiesgosAgroclimaticosComponent.cache.set(key, this.riesgos);
    } catch (error: any) {
      this.error = error?.error?.message || error?.message || 'No se pudo calcular riesgos agroclimaticos.';
    } finally {
      CardRiesgosAgroclimaticosComponent.pending.delete(key);
      this.loading = false;
    }
  }

  public nivelLabel(nivel?: string): string {
    return (nivel || 'bajo').toUpperCase();
  }

  public fechaLabel(fecha?: string): string {
    if (!fecha) return 'Sin fecha critica';
    const date = new Date(`${fecha}T12:00:00`);
    if (Number.isNaN(date.getTime())) return fecha;
    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: 'short',
    });
  }

  public calibracionLabel(riesgo?: IRiesgoAgroclimatico): string {
    if (!riesgo?.calibracionVarietal) return 'Base fenologica';
    if (riesgo.calibracionVarietal === 'semilla') return 'Variedad cargada';
    if (riesgo.calibracionVarietal === 'variedad') return 'Tabla varietal';
    return 'Base fenologica';
  }

  public calidadLabel(riesgo?: IRiesgoAgroclimatico): string {
    const calidad = riesgo?.calidadDatos;
    if (!calidad) return 'Calidad no informada';
    const label =
      calidad.nivel === 'media'
        ? 'calidad media'
        : calidad.nivel === 'alta'
          ? 'calidad alta'
          : calidad.nivel === 'sin_datos'
            ? 'sin datos'
            : 'calidad baja';
    return `${label}${calidad.score !== undefined ? ` ${calidad.score}/100` : ''}`;
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['lote'] || changes['siembra']) {
      void this.cargar();
    }
  }

  private get centro(): { lat: number; lng: number } | undefined {
    const centro = this.lote?.ubicacion?.centro || this.lote?.establecimiento?.ubicacion?.[0]?.centro;
    const lat = Number(centro?.lat);
    const lng = Number(centro?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
  }

  private requestKey(): string {
    return [
      this.centro?.lat,
      this.centro?.lng,
      this.siembra?.semilla?.cultivo,
      this.siembra?.semilla?.variedad,
      this.siembra?.fechaSiembra,
      this.siembra?.semilla?.fenologiaReferencia?.edadProductivaDesdeAnios,
      this.siembra?.semilla?.sensibilidadHelada?.ajusteUmbralC,
      this.siembra?.semilla?.sensibilidadHelada?.fuente,
      new Date().toISOString().slice(0, 10),
    ].join('|');
  }
}
