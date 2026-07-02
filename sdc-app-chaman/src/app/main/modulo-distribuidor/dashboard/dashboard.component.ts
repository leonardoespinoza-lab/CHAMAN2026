import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IDistribuidor, IFilter, IGeoJSONPolygon, IListado, ILote, IProductor, IQueryParam, ISiembra } from 'modelos/src';
import { Feature, Map as OlMap, View } from 'ol';
import { FeatureLike } from 'ol/Feature';
import { Point, Polygon } from 'ol/geom';
import VectorLayer from 'ol/layer/Vector';
import { fromLonLat } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import CircleStyle from 'ol/style/Circle';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import Style from 'ol/style/Style';
import Text from 'ol/style/Text';
import { Subscription } from 'rxjs';
import { HelperService } from '../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../auxiliares/servicios/listados';
import { OpenLayersService } from '../../../auxiliares/servicios/openLayers.service';
import { SharedModule } from '../../../auxiliares/shared.module';

type NivelRiesgoSanitario = 'sin-prediccion' | 'bajo' | 'medio' | 'alto';

interface IRiesgoCard {
  nivel: NivelRiesgoSanitario;
  titulo: string;
  descripcion: string;
  clase: string;
  hectareas: number;
  lotes: number;
  porcentaje: number;
}

interface IResumenRanking {
  id?: string;
  nombre: string;
  detalle: string;
  hectareas: number;
  lotes: number;
  porcentaje: number;
  alertas: number;
}

interface IAlertaSanitaria {
  idLote?: string;
  lote: string;
  cultivo: string;
  productor: string;
  enfermedad: string;
  resultado: number;
  hectareas: number;
  nivel: NivelRiesgoSanitario;
}

interface ILoteOperativo {
  id?: string;
  nombre: string;
  productor: string;
  cultivo: string;
  hectareas: number;
  nivel: NivelRiesgoSanitario;
  enfermedad: string;
  resultado: number;
  geojson?: IGeoJSONPolygon;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  imports: [SharedModule],
})
export class DashboardDistribuidorComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('networkMap') private networkMap?: ElementRef<HTMLDivElement>;

  public loading = true;

  public siembras: ISiembra[] = [];
  public productores: IProductor[] = [];
  public lotes: ILote[] = [];
  public distribuidorActual?: IDistribuidor;

  public totalHectareas = 0;
  public totalHectareasSembradas = 0;
  public totalLotes = 0;
  public totalSiembrasActivas = 0;
  public hectareasConAlerta = 0;
  public lotesConAlerta = 0;
  public coberturaPrediccion = 0;
  public lotesGeorreferenciados = 0;
  public estadoSanitario = 'Sin datos';
  public estadoSanitarioClase = 'muted';

  public riesgoCards: IRiesgoCard[] = [];
  public productoresResumen: IResumenRanking[] = [];
  public cultivosResumen: IResumenRanking[] = [];
  public alertasSanitarias: IAlertaSanitaria[] = [];
  public lotesOperativos: ILoteOperativo[] = [];
  public loteSeleccionado?: ILoteOperativo;

  public riegosEnfermedadPorHectarea = {
    nada: 0,
    bajo: 0,
    medio: 0,
    alto: 0,
  };

  public siembras$?: Subscription;
  public productores$?: Subscription;
  public lotes$?: Subscription;
  public distribuidor$?: Subscription;

  private map?: OlMap;
  private lotesSource = new VectorSource();
  private puntosSource = new VectorSource();
  private lotesLayer = new VectorLayer({
    source: this.lotesSource,
    zIndex: 2,
    style: (feature) => this.estiloLote(feature),
  });
  private puntosLayer = new VectorLayer({
    source: this.puntosSource,
    zIndex: 4,
    style: (feature) => this.estiloPunto(feature),
  });

  constructor(
    private listadosService: ListadosService,
    private helper: HelperService,
    private router: Router,
    private activatedRoute: ActivatedRoute
  ) {
    this.resetRiesgoCards();
  }

  public formatHa(value: number, digits = 1): string {
    return `${this.formatNumber(value, digits)} ha`;
  }

  public formatNumber(value: number, digits = 0): string {
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(Number.isFinite(value) ? value : 0);
  }

  public trackByNivel(_: number, item: IRiesgoCard): string {
    return item.nivel;
  }

  public trackByNombre(_: number, item: IResumenRanking): string {
    return item.id || item.nombre;
  }

  public trackByAlerta(_: number, item: IAlertaSanitaria): string {
    return `${item.idLote || item.lote}-${item.enfermedad}`;
  }

  public trackByLote(_: number, item: ILoteOperativo): string {
    return item.id || item.nombre;
  }

  public seleccionarLote(lote?: ILoteOperativo): void {
    this.loteSeleccionado = lote;
    this.lotesLayer.changed();

    if (!lote?.geojson?.coordinates?.length || !this.map) {
      return;
    }

    const polygon = new Polygon(lote.geojson.coordinates);
    polygon.transform('EPSG:4326', 'EPSG:3857');
    this.map.getView().fit(polygon.getExtent(), {
      padding: [52, 52, 52, 52],
      maxZoom: 16,
      duration: 300,
    });
  }

  public abrirLote(lote?: ILoteOperativo): void {
    if (!lote?.id) {
      this.helper.notifWarn('El lote no tiene identificador para abrir el detalle.');
      return;
    }
    this.router.navigateByUrl(`/lotes/detalles/${lote.id}`);
  }

  public exportarInformeDistribuidor(): void {
    const fecha = new Date();
    const fechaTexto = fecha.toLocaleDateString('es-AR');
    const nombreDistribuidor = this.distribuidorActual?.nombre || 'Distribuidor';
    const nombreArchivo = `informe-distribuidor-${nombreDistribuidor}-${fecha.toISOString().slice(0, 10)}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase();
    const reporte = window.open('', '_blank', 'width=1024,height=768');

    if (!reporte) {
      this.helper.notifWarn('El navegador bloqueo la ventana del informe. Habilita ventanas emergentes para exportar PDF.');
      return;
    }

    const rowsProductores = this.productoresResumen
      .map(
        (item) => `
          <tr>
            <td>${this.escapeHtml(item.nombre)}</td>
            <td class="number">${this.formatNumber(item.lotes)}</td>
            <td class="number">${this.formatHa(item.hectareas)}</td>
            <td class="number">${this.formatNumber(item.alertas)}</td>
          </tr>`
      )
      .join('');

    const rowsCultivos = this.cultivosResumen
      .map(
        (item) => `
          <tr>
            <td>${this.escapeHtml(item.nombre)}</td>
            <td class="number">${this.formatNumber(item.lotes)}</td>
            <td class="number">${this.formatHa(item.hectareas)}</td>
            <td class="number">${this.formatNumber(item.alertas)}</td>
          </tr>`
      )
      .join('');

    const rowsAlertas = this.alertasSanitarias
      .map(
        (item) => `
          <tr>
            <td>${this.escapeHtml(item.lote)}<small>${this.escapeHtml(item.productor)}</small></td>
            <td>${this.escapeHtml(item.cultivo)}</td>
            <td>${this.escapeHtml(item.enfermedad)}</td>
            <td class="number">${this.formatNumber(item.resultado, 1)}%</td>
            <td class="number">${this.formatHa(item.hectareas)}</td>
          </tr>`
      )
      .join('');

    const rowsSanidad = this.riesgoCards
      .map(
        (item) => `
          <tr>
            <td><span class="status ${item.clase}"></span>${this.escapeHtml(item.titulo)}</td>
            <td class="number">${this.formatNumber(item.lotes)}</td>
            <td class="number">${this.formatHa(item.hectareas)}</td>
            <td class="number">${this.formatNumber(item.porcentaje)}%</td>
          </tr>`
      )
      .join('');

    const html = `
      <!doctype html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>${this.escapeHtml(nombreArchivo)}</title>
        <style>
          @page { size: A4; margin: 14mm; }
          * { box-sizing: border-box; }
          body { margin: 0; color: #14223a; font-family: Arial, Helvetica, sans-serif; font-size: 12px; }
          h1, h2, p { margin: 0; }
          .cover { border-bottom: 4px solid #2dd4bf; padding-bottom: 16px; margin-bottom: 16px; }
          .eyebrow { color: #0f766e; font-size: 10px; font-weight: 700; text-transform: uppercase; }
          .title-row { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; }
          h1 { margin-top: 8px; font-size: 30px; line-height: 1.05; }
          .subtitle { margin-top: 8px; color: #48627f; font-size: 13px; line-height: 1.4; }
          .date { border: 1px solid #c8d7e7; border-radius: 8px; padding: 10px 12px; min-width: 132px; text-align: right; }
          .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 16px 0; }
          .metric { border: 1px solid #c8d7e7; border-left: 4px solid #2dd4bf; border-radius: 8px; padding: 11px; min-height: 78px; }
          .metric.warn { border-left-color: #f59e0b; }
          .metric span { display: block; color: #5b708c; font-size: 10px; text-transform: uppercase; }
          .metric strong { display: block; margin-top: 8px; font-size: 22px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
          .section { break-inside: avoid; margin-bottom: 16px; }
          h2 { margin-bottom: 8px; font-size: 16px; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #ecfeff; color: #182c4a; font-size: 10px; text-align: left; text-transform: uppercase; }
          th, td { border: 1px solid #d9e4ef; padding: 7px 8px; vertical-align: top; }
          td small { display: block; color: #64748b; margin-top: 2px; line-height: 1.25; }
          .number { text-align: right; white-space: nowrap; }
          .status { display: inline-block; width: 9px; height: 9px; border-radius: 999px; margin-right: 7px; }
          .status.muted { background: #94a3b8; }
          .status.ok { background: #65a30d; }
          .status.warn { background: #f59e0b; }
          .status.danger { background: #dc2626; }
          .note { border: 1px solid #c8d7e7; border-radius: 8px; background: #f8fbfd; padding: 10px; color: #48627f; line-height: 1.35; }
          .footer { margin-top: 18px; padding-top: 10px; border-top: 1px solid #d9e4ef; color: #64748b; font-size: 10px; }
          @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <main>
          <section class="cover">
            <div class="title-row">
              <div>
                <span class="eyebrow">Informe ejecutivo Chaman</span>
                <h1>${this.escapeHtml(nombreDistribuidor)}</h1>
                <p class="subtitle">Resumen operativo de productores asociados, lotes, hectareas, cultivos y prioridades sanitarias.</p>
              </div>
              <div class="date"><span class="eyebrow">Fecha</span><strong>${fechaTexto}</strong></div>
            </div>
          </section>

          <section class="metrics">
            <article class="metric"><span>Productores</span><strong>${this.formatNumber(this.productores.length)}</strong></article>
            <article class="metric"><span>Lotes</span><strong>${this.formatNumber(this.totalLotes)}</strong></article>
            <article class="metric"><span>Hectareas</span><strong>${this.formatHa(this.totalHectareas)}</strong></article>
            <article class="metric warn"><span>Lotes con alerta</span><strong>${this.formatNumber(this.lotesConAlerta)}</strong></article>
            <article class="metric"><span>Siembras activas</span><strong>${this.formatNumber(this.totalSiembrasActivas)}</strong></article>
            <article class="metric"><span>Cobertura prediccion</span><strong>${this.formatNumber(this.coberturaPrediccion)}%</strong></article>
            <article class="metric"><span>Lotes georreferenciados</span><strong>${this.formatNumber(this.lotesGeorreferenciados)}</strong></article>
            <article class="metric"><span>Estado sanitario</span><strong>${this.escapeHtml(this.estadoSanitario)}</strong></article>
          </section>

          <section class="grid">
            <div class="section">
              <h2>Resumen por productor</h2>
              <table><thead><tr><th>Productor</th><th>Lotes</th><th>Hectareas</th><th>Alertas</th></tr></thead><tbody>${rowsProductores || '<tr><td colspan="4">Sin productores asociados.</td></tr>'}</tbody></table>
            </div>
            <div class="section">
              <h2>Resumen por cultivo</h2>
              <table><thead><tr><th>Cultivo</th><th>Lotes</th><th>Hectareas</th><th>Alertas</th></tr></thead><tbody>${rowsCultivos || '<tr><td colspan="4">Sin cultivos activos.</td></tr>'}</tbody></table>
            </div>
          </section>

          <section class="grid">
            <div class="section">
              <h2>Sanidad por hectareas</h2>
              <table><thead><tr><th>Categoria</th><th>Lotes</th><th>Hectareas</th><th>%</th></tr></thead><tbody>${rowsSanidad}</tbody></table>
            </div>
            <div class="section">
              <h2>Prioridades sanitarias</h2>
              <table><thead><tr><th>Lote</th><th>Cultivo</th><th>Evento</th><th>Valor</th><th>Has</th></tr></thead><tbody>${rowsAlertas || '<tr><td colspan="5">Sin prioridades criticas.</td></tr>'}</tbody></table>
            </div>
          </section>

          <section class="section">
            <div class="note">
              Los colores de mapa y las categorias sanitarias resumen la ultima prediccion disponible por lote. Amarillo indica observacion; rojo indica prioridad alta para revisar el detalle del lote.
            </div>
          </section>

          <footer class="footer">Chaman Agro - Informe ejecutivo generado automaticamente.</footer>
        </main>
        <script>
          document.title = ${JSON.stringify(nombreArchivo)};
          setTimeout(() => window.print(), 300);
        </script>
      </body>
      </html>
    `;

    reporte.document.open();
    reporte.document.write(html);
    reporte.document.close();
  }

  private resetRiesgoCards(): void {
    this.riesgoCards = [
      {
        nivel: 'alto',
        titulo: 'Riesgo alto',
        descripcion: 'Prioridad inmediata',
        clase: 'danger',
        hectareas: 0,
        lotes: 0,
        porcentaje: 0,
      },
      {
        nivel: 'medio',
        titulo: 'Riesgo medio',
        descripcion: 'En observacion',
        clase: 'warn',
        hectareas: 0,
        lotes: 0,
        porcentaje: 0,
      },
      {
        nivel: 'bajo',
        titulo: 'Riesgo bajo',
        descripcion: 'Sin accion urgente',
        clase: 'ok',
        hectareas: 0,
        lotes: 0,
        porcentaje: 0,
      },
      {
        nivel: 'sin-prediccion',
        titulo: 'Sin prediccion',
        descripcion: 'Falta motor sanitario',
        clase: 'muted',
        hectareas: 0,
        lotes: 0,
        porcentaje: 0,
      },
    ];
  }

  private obtenerUltimasSiembrasPorLote(): Map<string, ISiembra> {
    const map = new Map<string, ISiembra>();
    const ordenadas = [...this.siembras].sort((a, b) => {
      const fechaA = new Date(a.fechaSiembra || '').getTime() || 0;
      const fechaB = new Date(b.fechaSiembra || '').getTime() || 0;
      return fechaB - fechaA;
    });

    ordenadas.forEach((siembra) => {
      const idLote = siembra.idLote || siembra.lote?._id;
      if (idLote && !map.has(idLote)) {
        map.set(idLote, siembra);
      }
    });

    return map;
  }

  private cultivoSiembra(siembra?: ISiembra): string {
    return siembra?.semilla?.cultivo || 'Sin cultivo';
  }

  private umbralesRiesgo(siembra?: ISiembra): { medio: number; alto: number } {
    const cultivo = this.normalizar(siembra?.semilla?.cultivo || '');
    if (cultivo === 'cebada') {
      return { medio: 35, alto: 60 };
    }
    return { medio: 15, alto: 20 };
  }

  private nivelRiesgo(siembra?: ISiembra): NivelRiesgoSanitario {
    if (!siembra?.ultimaPrediccion) {
      return 'sin-prediccion';
    }

    const enfermedades = siembra.ultimaPrediccion.enfermedades || [];
    const maximo = enfermedades.reduce((max, enfermedad) => Math.max(max, enfermedad.resultado || 0), 0);
    const umbrales = this.umbralesRiesgo(siembra);

    if (maximo >= umbrales.alto) {
      return 'alto';
    }
    if (maximo >= umbrales.medio) {
      return 'medio';
    }
    return 'bajo';
  }

  private alertaPrincipal(siembra?: ISiembra): { enfermedad: string; resultado: number } | null {
    const enfermedades = siembra?.ultimaPrediccion?.enfermedades || [];
    if (!enfermedades.length) {
      return null;
    }
    const principal = enfermedades.reduce((max, enfermedad) =>
      (enfermedad.resultado || 0) > (max.resultado || 0) ? enfermedad : max
    );
    return {
      enfermedad: principal.enfermedad || 'Enfermedad',
      resultado: principal.resultado || 0,
    };
  }

  private agregarResumen(map: Map<string, IResumenRanking>, id: string | undefined, nombre: string, hectareas: number, alerta: boolean): void {
    const key = id || nombre || 'Sin dato';
    const actual = map.get(key) || {
      id,
      nombre: nombre || 'Sin dato',
      detalle: '',
      hectareas: 0,
      lotes: 0,
      porcentaje: 0,
      alertas: 0,
    };
    actual.hectareas += hectareas;
    actual.lotes += 1;
    actual.alertas += alerta ? 1 : 0;
    map.set(key, actual);
  }

  private recomputarResumen(): void {
    const siembrasPorLote = this.obtenerUltimasSiembrasPorLote();
    const productoresMap = new Map<string, IResumenRanking>();
    const cultivosMap = new Map<string, IResumenRanking>();
    const riesgos = new Map<NivelRiesgoSanitario, { hectareas: number; lotes: number }>([
      ['sin-prediccion', { hectareas: 0, lotes: 0 }],
      ['bajo', { hectareas: 0, lotes: 0 }],
      ['medio', { hectareas: 0, lotes: 0 }],
      ['alto', { hectareas: 0, lotes: 0 }],
    ]);
    const alertas: IAlertaSanitaria[] = [];
    const operativos: ILoteOperativo[] = [];

    this.totalHectareas = 0;
    this.totalHectareasSembradas = 0;
    this.totalLotes = this.lotes.length;
    this.totalSiembrasActivas = siembrasPorLote.size;

    for (const lote of this.lotes) {
      const idLote = lote._id || '';
      const hectareas = this.numero(lote.ubicacion?.superficie);
      const productor = this.productores.find((item) => item._id === lote.idProductor);
      const siembra = idLote ? siembrasPorLote.get(idLote) : undefined;
      const nivel = this.nivelRiesgo(siembra);
      const principal = this.alertaPrincipal(siembra);
      const cultivo = this.cultivoSiembra(siembra);
      const productorNombre = productor?.nombre || 'Sin productor';
      const tieneAlerta = nivel === 'medio' || nivel === 'alto';
      const riesgo = riesgos.get(nivel)!;
      const geojson = lote.ubicacion?.geojson;

      this.totalHectareas += hectareas;
      riesgo.hectareas += hectareas;
      riesgo.lotes += 1;

      this.agregarResumen(productoresMap, productor?._id, productorNombre, hectareas, tieneAlerta);

      if (siembra) {
        this.totalHectareasSembradas += hectareas;
        this.agregarResumen(cultivosMap, cultivo, cultivo, hectareas, tieneAlerta);
      }

      const operativo: ILoteOperativo = {
        id: idLote,
        nombre: lote.nombre || 'Lote sin nombre',
        productor: productorNombre,
        cultivo,
        hectareas,
        nivel,
        enfermedad: principal?.enfermedad || (nivel === 'sin-prediccion' ? 'Sin prediccion' : 'Sin evento critico'),
        resultado: principal?.resultado || 0,
        geojson,
      };
      operativos.push(operativo);

      if (tieneAlerta) {
        alertas.push({
          idLote,
          lote: operativo.nombre,
          cultivo,
          productor: productorNombre,
          enfermedad: principal?.enfermedad || 'Riesgo sanitario',
          resultado: principal?.resultado || 0,
          hectareas,
          nivel,
        });
      }
    }

    this.riegosEnfermedadPorHectarea = {
      nada: riesgos.get('sin-prediccion')?.hectareas || 0,
      bajo: riesgos.get('bajo')?.hectareas || 0,
      medio: riesgos.get('medio')?.hectareas || 0,
      alto: riesgos.get('alto')?.hectareas || 0,
    };

    this.hectareasConAlerta = this.riegosEnfermedadPorHectarea.medio + this.riegosEnfermedadPorHectarea.alto;
    this.lotesConAlerta = (riesgos.get('medio')?.lotes || 0) + (riesgos.get('alto')?.lotes || 0);
    this.coberturaPrediccion = this.totalHectareas
      ? Math.round(((this.totalHectareas - this.riegosEnfermedadPorHectarea.nada) / this.totalHectareas) * 100)
      : 0;
    this.lotesGeorreferenciados = operativos.filter((lote) => !!lote.geojson?.coordinates?.length).length;

    this.estadoSanitario = this.estadoSanitarioResumen();
    this.estadoSanitarioClase = this.estadoSanitarioClaseResumen();
    this.riesgoCards = this.riesgoCards.map((card) => {
      const resumen = riesgos.get(card.nivel)!;
      return {
        ...card,
        hectareas: resumen.hectareas,
        lotes: resumen.lotes,
        porcentaje: this.totalHectareas ? Math.round((resumen.hectareas / this.totalHectareas) * 100) : 0,
      };
    });

    this.productoresResumen = this.ordenarRanking(productoresMap, this.totalHectareas).slice(0, 10);
    this.cultivosResumen = this.ordenarRanking(cultivosMap, this.totalHectareasSembradas).slice(0, 10);
    this.alertasSanitarias = alertas.sort((a, b) => b.resultado - a.resultado || b.hectareas - a.hectareas).slice(0, 8);
    this.lotesOperativos = operativos.sort((a, b) => this.ordenRiesgo(b.nivel) - this.ordenRiesgo(a.nivel) || b.hectareas - a.hectareas);

    if (this.loteSeleccionado) {
      this.loteSeleccionado = this.lotesOperativos.find((item) => item.id === this.loteSeleccionado?.id);
    }

    this.redibujarMapa();
  }

  private ordenarRanking(map: Map<string, IResumenRanking>, total: number): IResumenRanking[] {
    return [...map.values()]
      .map((item) => ({
        ...item,
        detalle: `${item.lotes} ${item.lotes === 1 ? 'lote' : 'lotes'}${item.alertas ? ` - ${item.alertas} alerta${item.alertas === 1 ? '' : 's'}` : ''}`,
        porcentaje: total ? Math.round((item.hectareas / total) * 100) : 0,
      }))
      .sort((a, b) => b.hectareas - a.hectareas || a.nombre.localeCompare(b.nombre));
  }

  private ordenRiesgo(nivel: NivelRiesgoSanitario): number {
    if (nivel === 'alto') return 3;
    if (nivel === 'medio') return 2;
    if (nivel === 'bajo') return 1;
    return 0;
  }

  private estadoSanitarioResumen(): string {
    if (!this.totalLotes) {
      return 'Sin lotes';
    }
    if (this.riegosEnfermedadPorHectarea.alto > 0) {
      return 'Prioridad alta';
    }
    if (this.riegosEnfermedadPorHectarea.medio > 0) {
      return 'En observacion';
    }
    if (this.riegosEnfermedadPorHectarea.bajo > 0) {
      return 'Estable';
    }
    return 'Sin prediccion';
  }

  private estadoSanitarioClaseResumen(): string {
    if (this.riegosEnfermedadPorHectarea.alto > 0) {
      return 'danger';
    }
    if (this.riegosEnfermedadPorHectarea.medio > 0) {
      return 'warn';
    }
    if (this.riegosEnfermedadPorHectarea.bajo > 0) {
      return 'ok';
    }
    return 'muted';
  }

  private coordenadasDistribuidor(): [number, number] | null {
    const coordinates = this.distribuidorActual?.geojson?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return null;
    }

    const lon = Number(coordinates[0]);
    const lat = Number(coordinates[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      return null;
    }

    return [lon, lat];
  }

  private centroideGeojson(geojson?: IGeoJSONPolygon): [number, number] | null {
    const ring = geojson?.coordinates?.[0];
    if (!ring?.length) {
      return null;
    }
    const puntos = ring.filter((coord) => Array.isArray(coord) && coord.length >= 2);
    if (!puntos.length) {
      return null;
    }
    const suma = puntos.reduce(
      (acc, coord) => {
        acc.lon += Number(coord[0]) || 0;
        acc.lat += Number(coord[1]) || 0;
        return acc;
      },
      { lon: 0, lat: 0 }
    );
    return [suma.lon / puntos.length, suma.lat / puntos.length];
  }

  private estiloLote(feature: FeatureLike): Style {
    const lote = feature.get('lote') as ILoteOperativo | undefined;
    const seleccionado = lote?.id && lote.id === this.loteSeleccionado?.id;
    const color = this.colorNivel(lote?.nivel || 'sin-prediccion');

    return new Style({
      fill: new Fill({ color: color.fill }),
      stroke: new Stroke({
        color: seleccionado ? '#ffffff' : color.stroke,
        width: seleccionado ? 4 : 2,
      }),
      text: new Text({
        text: lote?.nombre || '',
        font: seleccionado ? 'bold 13px Lato, Arial, sans-serif' : 'bold 11px Lato, Arial, sans-serif',
        fill: new Fill({ color: '#10233b' }),
        stroke: new Stroke({ color: '#ffffff', width: 3 }),
        overflow: true,
      }),
    });
  }

  private estiloPunto(feature: FeatureLike): Style {
    const tipo = feature.get('tipo') as 'distribuidor' | 'productor';
    const label = feature.get('label') || '';

    return new Style({
      image: new CircleStyle({
        radius: tipo === 'distribuidor' ? 9 : 6,
        fill: new Fill({ color: tipo === 'distribuidor' ? '#2ed6cc' : '#10233b' }),
        stroke: new Stroke({ color: '#ffffff', width: 3 }),
      }),
      text: new Text({
        text: label,
        font: 'bold 12px Lato, Arial, sans-serif',
        fill: new Fill({ color: '#10233b' }),
        stroke: new Stroke({ color: '#ffffff', width: 4 }),
        offsetY: tipo === 'distribuidor' ? -22 : 18,
        overflow: true,
      }),
    });
  }

  private colorNivel(nivel: NivelRiesgoSanitario): { fill: string; stroke: string } {
    if (nivel === 'alto') {
      return { fill: 'rgba(239, 83, 80, 0.48)', stroke: '#ef5350' };
    }
    if (nivel === 'medio') {
      return { fill: 'rgba(241, 171, 45, 0.5)', stroke: '#f1ab2d' };
    }
    if (nivel === 'bajo') {
      return { fill: 'rgba(96, 194, 79, 0.42)', stroke: '#60c24f' };
    }
    return { fill: 'rgba(148, 163, 184, 0.38)', stroke: '#64748b' };
  }

  private redibujarMapa(): void {
    this.lotesSource.clear();
    this.puntosSource.clear();

    this.lotesOperativos.forEach((lote) => {
      if (!lote.geojson?.coordinates?.length) {
        return;
      }
      const polygon = new Polygon(lote.geojson.coordinates);
      polygon.transform('EPSG:4326', 'EPSG:3857');
      const feature = new Feature({ geometry: polygon });
      feature.setId(lote.id || lote.nombre);
      feature.set('lote', lote);
      this.lotesSource.addFeature(feature);
    });

    const distribuidorCoordinates = this.coordenadasDistribuidor();
    if (distribuidorCoordinates) {
      const feature = new Feature({
        geometry: new Point(fromLonLat(distribuidorCoordinates)),
      });
      feature.set('tipo', 'distribuidor');
      feature.set('label', this.distribuidorActual?.nombre || 'Distribuidor');
      this.puntosSource.addFeature(feature);
    }

    this.productoresResumen.slice(0, 20).forEach((productor) => {
      const lote = this.lotesOperativos.find((item) => item.productor === productor.nombre && item.geojson);
      const centro = this.centroideGeojson(lote?.geojson);
      if (!centro) {
        return;
      }
      const feature = new Feature({
        geometry: new Point(fromLonLat(centro)),
      });
      feature.set('tipo', 'productor');
      feature.set('label', productor.nombre);
      this.puntosSource.addFeature(feature);
    });

    if (!this.map) {
      return;
    }

    const source = this.lotesSource.isEmpty() ? this.puntosSource : this.lotesSource;
    if (source.isEmpty()) {
      return;
    }

    this.map.updateSize();
    this.map.getView().fit(source.getExtent(), {
      padding: [46, 46, 46, 46],
      maxZoom: 14,
      duration: 250,
    });
  }

  private inicializarMapa(): void {
    if (!this.networkMap?.nativeElement || this.map) {
      return;
    }

    this.map = new OlMap({
      target: this.networkMap.nativeElement,
      layers: [OpenLayersService.mapTileSatelite(17), OpenLayersService.mapReferenciasPoliticas(), this.lotesLayer, this.puntosLayer],
      view: new View({
        center: fromLonLat([-63.6, -34.6]),
        zoom: 5,
        minZoom: 3,
        maxZoom: 18,
      }),
    });

    this.map.on('singleclick', (event) => {
      const feature = this.map?.forEachFeatureAtPixel(event.pixel, (featureAtPixel) => featureAtPixel as Feature);
      const lote = feature?.get('lote') as ILoteOperativo | undefined;
      if (lote) {
        this.seleccionarLote(lote);
      }
    });

    setTimeout(() => {
      this.map?.updateSize();
      this.redibujarMapa();
    }, 0);
  }

  private numero(value: unknown): number {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }

  private normalizar(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  private escapeHtml(value: string | number | undefined | null): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private async listarDistribuidor(): Promise<void> {
    const permiso = this.helper.permiso;
    if (permiso?.distribuidor) {
      this.distribuidorActual = permiso.distribuidor;
    }

    if (!permiso?.idDistribuidor) {
      return;
    }

    const query: IQueryParam = {
      filter: JSON.stringify({ _id: permiso.idDistribuidor }),
      select: 'nombre direccion geojson idQuimica',
      limit: 1,
    };

    this.distribuidor$?.unsubscribe();
    this.distribuidor$ = this.listadosService
      .subscribe<IListado<IDistribuidor>>('distribuidors', query)
      .subscribe((data) => {
        this.distribuidorActual = data.datos?.[0] || this.distribuidorActual;
        this.redibujarMapa();
      });
    await this.listadosService.getLastValue('distribuidors', query);
  }

  private async listarSiembras(): Promise<void> {
    const fechaHace6Meses = new Date();
    fechaHace6Meses.setMonth(fechaHace6Meses.getMonth() - 6);
    const filter: IFilter<ISiembra> = {
      fechaSiembra: {
        $gt: fechaHace6Meses.toISOString(),
      },
    };
    const populate = [
      {
        path: 'semilla',
        select: 'cultivo variedad',
      },
      {
        path: 'lote',
        select: 'nombre ubicacion',
      },
    ];
    const query: IQueryParam = {
      sort: '-fechaSiembra',
      populate: JSON.stringify(populate),
      filter: JSON.stringify(filter),
      select: 'fechaSiembra idProductor idDistribuidor idEstablecimiento idLote ultimaPrediccion idSemilla lote',
      limit: 0,
    };

    this.siembras$?.unsubscribe();
    this.siembras$ = this.listadosService.subscribe<IListado<ISiembra>>('siembras', query).subscribe((data) => {
      this.siembras = data.datos || [];
      this.recomputarResumen();
    });
    await this.listadosService.getLastValue('siembras', query);
  }

  private async listarProductores(): Promise<void> {
    const query: IQueryParam = {
      select: 'nombre idDistribuidor idQuimica',
      limit: 0,
    };

    this.productores$?.unsubscribe();
    this.productores$ = this.listadosService.subscribe<IListado<IProductor>>('productors', query).subscribe((data) => {
      this.productores = data.datos || [];
      this.recomputarResumen();
    });
    await this.listadosService.getLastValue('productors', query);
  }

  private async listarLotes(): Promise<void> {
    const query: IQueryParam = {
      select: 'nombre idDistribuidor idProductor ubicacion',
      limit: 0,
    };

    this.lotes$?.unsubscribe();
    this.lotes$ = this.listadosService.subscribe<IListado<ILote>>('lotes', query).subscribe((data) => {
      this.lotes = data.datos || [];
      this.recomputarResumen();
    });
    await this.listadosService.getLastValue('lotes', query);
  }

  private async cargaInicial(): Promise<void> {
    await Promise.all([this.listarDistribuidor(), this.listarSiembras(), this.listarProductores(), this.listarLotes()]);
    this.recomputarResumen();
  }

  async ngOnInit(): Promise<void> {
    this.loading = true;
    this.activatedRoute.queryParams.subscribe(async () => {
      await this.cargaInicial();
      this.loading = false;
    });
  }

  ngAfterViewInit(): void {
    this.inicializarMapa();
  }

  ngOnDestroy(): void {
    this.siembras$?.unsubscribe();
    this.productores$?.unsubscribe();
    this.lotes$?.unsubscribe();
    this.distribuidor$?.unsubscribe();
    this.map?.setTarget(undefined);
  }
}
