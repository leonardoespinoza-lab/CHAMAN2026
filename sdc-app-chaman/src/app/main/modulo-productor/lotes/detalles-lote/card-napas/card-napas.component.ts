import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { INapaPozoReferencia, INapaReferenciaLote } from 'modelos/src';
import { NapasService } from '../../../../../auxiliares/http/napas.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetallesLote } from '../detalles-lote.component';

interface NapaMapPoint {
  id: string;
  label: string;
  left: number;
  top: number;
  isLote: boolean;
  tieneNivel: boolean;
  tooltip: string;
}

@Component({
  selector: 'app-card-napas',
  imports: [CommonModule, SharedModule],
  templateUrl: './card-napas.component.html',
  styleUrl: './card-napas.component.scss',
})
export class CardNapasComponent implements OnChanges {
  @Input() public lote?: IDetallesLote;

  public referencia?: INapaReferenciaLote;
  public cargando = false;
  public error?: string;
  public verDetalle = false;
  private ultimoKey?: string;
  private readonly numeroAr = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

  constructor(
    private napasService: NapasService,
    public helper: HelperService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lote']) {
      void this.cargarReferencia();
    }
  }

  public async refrescar(event?: Event): Promise<void> {
    event?.stopPropagation();
    this.ultimoKey = undefined;
    await this.cargarReferencia();
  }

  public abrirDetalle(): void {
    if (this.referencia) {
      this.verDetalle = true;
    }
  }

  public get coordenadas(): { lat: number; lng: number } | undefined {
    const centro = this.lote?.ubicacion?.centro;
    if (!centro?.lat || !centro?.lng) return undefined;
    return { lat: centro.lat, lng: centro.lng };
  }

  public get subtitulo(): string {
    if (this.cargando) return 'Buscando red SIAS cercana al lote';
    if (this.error) return 'No se pudo consultar la red publica';
    if (!this.referencia) return 'Referencia territorial pendiente';
    return `${this.referencia.cobertura.totalPozos} pozos cercanos - ${this.referencia.cobertura.pozosConNivel} con nivel`;
  }

  public get calidadLabel(): string {
    const calidad = this.referencia?.cobertura.calidad;
    if (calidad === 'alta') return 'Cobertura alta';
    if (calidad === 'media') return 'Cobertura media';
    if (calidad === 'baja') return 'Referencia baja';
    return 'Sin dato cercano';
  }

  public get coberturaPct(): number {
    const calidad = this.referencia?.cobertura.calidad;
    if (calidad === 'alta') return 88;
    if (calidad === 'media') return 62;
    if (calidad === 'baja') return 34;
    return 10;
  }

  public get nivelResumen(): string {
    const mediana = this.referencia?.estadisticas?.nivelEstaticoMedianaM;
    if (mediana === undefined) return 'Sin nivel';
    return `${this.numeroAr.format(mediana)} m bajo sup.`;
  }

  public get nivelDetalle(): string {
    const mediana = this.referencia?.estadisticas?.nivelEstaticoMedianaM;
    if (mediana === undefined) return 'Sin nivel estatico publicado cerca del lote.';
    return `Profundidad de referencia al agua: ${this.numeroAr.format(mediana)} m bajo la superficie del terreno.`;
  }

  public get distanciaResumen(): string {
    const distancia = this.referencia?.cobertura.distanciaMasCercanaConNivelKm;
    if (distancia === undefined) return 'Sin pozo con nivel';
    return `${this.numeroAr.format(distancia)} km`;
  }

  public get pozosPrincipales(): INapaPozoReferencia[] {
    return (this.referencia?.pozos || []).slice(0, 6);
  }

  public get pozosMapa(): INapaPozoReferencia[] {
    return (this.referencia?.pozos || []).slice(0, 12);
  }

  public get puntosMapa(): NapaMapPoint[] {
    const coordenadas = this.coordenadas;
    const pozos = this.pozosMapa;
    if (!coordenadas || !pozos.length) return [];

    const coords = [{ lat: coordenadas.lat, lng: coordenadas.lng }, ...pozos];
    let minLat = Math.min(...coords.map((item) => item.lat));
    let maxLat = Math.max(...coords.map((item) => item.lat));
    let minLng = Math.min(...coords.map((item) => item.lng));
    let maxLng = Math.max(...coords.map((item) => item.lng));
    const latPad = Math.max((maxLat - minLat) * 0.16, 0.01);
    const lngPad = Math.max((maxLng - minLng) * 0.16, 0.01);
    minLat -= latPad;
    maxLat += latPad;
    minLng -= lngPad;
    maxLng += lngPad;
    const latSpan = Math.max(maxLat - minLat, 0.01);
    const lngSpan = Math.max(maxLng - minLng, 0.01);
    const toPoint = (lat: number, lng: number) => ({
      left: this.clamp(((lng - minLng) / lngSpan) * 100),
      top: this.clamp(((maxLat - lat) / latSpan) * 100),
    });
    const lotePoint = toPoint(coordenadas.lat, coordenadas.lng);
    return [
      {
        id: 'lote',
        label: this.lote?.nombre || 'Lote',
        ...lotePoint,
        isLote: true,
        tieneNivel: true,
        tooltip: `${this.lote?.nombre || 'Lote'}: ${coordenadas.lat.toFixed(4)}, ${coordenadas.lng.toFixed(4)}`,
      },
      ...pozos.map((pozo, index) => {
        const point = toPoint(pozo.lat, pozo.lng);
        const nivel =
          pozo.nivelEstaticoM !== undefined
            ? `${this.numeroAr.format(pozo.nivelEstaticoM)} m bajo superficie`
            : 'nivel no declarado';
        return {
          id: `${pozo.id}-${index}`,
          label: pozo.departamento || pozo.nombre || `Pozo ${index + 1}`,
          ...point,
          isLote: false,
          tieneNivel: !!pozo.tieneNivel,
          tooltip: `${pozo.nombre || 'Pozo SIAS'} - ${pozo.distanciaKm.toFixed(1)} km - ${nivel}`,
        };
      }),
    ];
  }

  public get mapaResumen(): string {
    if (!this.pozosMapa.length) return 'Sin pozos para ubicar en el mapa.';
    return `${this.pozosMapa.length} pozos SIAS referenciados contra el centro del lote.`;
  }

  public get maxNivel(): number {
    const valores = this.pozosPrincipales
      .map((pozo) => pozo.nivelEstaticoM)
      .filter((value): value is number => Number.isFinite(value));
    return Math.max(...valores, 1);
  }

  public nivelBar(pozo: INapaPozoReferencia): number {
    if (!pozo.nivelEstaticoM) return 0;
    return Math.max(6, Math.min(100, (pozo.nivelEstaticoM / this.maxNivel) * 100));
  }

  private clamp(value: number): number {
    return Math.max(4, Math.min(96, value));
  }

  private async cargarReferencia(): Promise<void> {
    const coordenadas = this.coordenadas;
    if (!coordenadas) {
      this.referencia = undefined;
      this.error = 'El lote no tiene coordenadas para consultar napas.';
      return;
    }

    const key = `${coordenadas.lat.toFixed(5)}:${coordenadas.lng.toFixed(5)}`;
    if (this.ultimoKey === key && this.referencia) return;
    this.ultimoKey = key;
    this.cargando = true;
    this.error = undefined;

    try {
      this.referencia = await this.napasService.referenciaTerritorial(coordenadas.lat, coordenadas.lng, 80);
    } catch (error) {
      console.error('Error al consultar napas', error);
      this.error = 'No se pudo consultar SIAS/COHIFE.';
    } finally {
      this.cargando = false;
    }
  }
}
