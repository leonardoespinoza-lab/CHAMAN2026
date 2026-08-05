import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  esCultivoPerenne,
  evaluarSanidadAgregada,
  esPrediccionMalezasOperativa,
  esHuellaHidricaConsolidada,
  IDistribuidor,
  IGeoJSONPolygon,
  IListado,
  ILote,
  IProductor,
  IQueryParam,
  ISiembra,
} from 'modelos/src';
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
import { LoginService } from '../../../auxiliares/http/login.service';
import { SharedModule } from '../../../auxiliares/shared.module';
import {
  BORDE_SEMAFORO_MAPA,
  COLOR_SEMAFORO_MAPA,
  estadoSanidadSemaforo,
} from '../../modulo-productor/mapa/mapa-semaforo';

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

type EstadoCoberturaServicio = 'con-dato' | 'parcial' | 'sin-dato' | 'no-consolidado' | 'no-aplica';

interface ICoberturaServicio {
  servicio: string;
  estado: EstadoCoberturaServicio;
  etiqueta: 'Con dato' | 'Parcial' | 'Sin dato' | 'No consolidado' | 'No aplica';
  detalle: string;
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
    public loginService: LoginService,
    private router: Router,
    private activatedRoute: ActivatedRoute
  ) {
    this.resetRiesgoCards();
  }

  public nombreGestor(): string {
    if (this.loginService.esAsesor) {
      return (
        this.helper.user?.datosPersonales?.nombre ||
        this.helper.user?.username ||
        'Asesor'
      );
    }
    return this.distribuidorActual?.nombre || 'Distribuidor';
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
    const corteTexto = fecha.toLocaleString('es-AR', {
      dateStyle: 'long',
      timeStyle: 'short',
    });
    const nombreDistribuidor = this.nombreGestor();
    const logoChaman = this.safeImageUrl(new URL('/images/logo-light.png', document.baseURI).href);
    const logoDistribuidor = this.safeImageUrl(this.distribuidorActual?.logo);
    const coberturaServicios = this.construirCoberturaServicios();
    const nombreArchivo = `informe-distribuidor-${nombreDistribuidor}-${fecha.toISOString().slice(0, 10)}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase();
    const reporte = window.open('', '_blank', 'width=1024,height=768');

    if (!reporte) {
      this.helper.notifWarn(
        'El navegador bloqueo la ventana del informe. Habilita ventanas emergentes para exportar PDF.'
      );
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
            <td class="number">${this.formatNumber(item.resultado, 1)}/100</td>
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

    const rowsCobertura = coberturaServicios
      .map(
        (item) => `
          <tr>
            <td><strong>${this.escapeHtml(item.servicio)}</strong></td>
            <td><span class="coverage-state ${item.estado}">${this.escapeHtml(item.etiqueta)}</span></td>
            <td>${this.escapeHtml(item.detalle)}</td>
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
          .brand-row { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 82px; margin-bottom: 12px; }
          .chaman-logo { display: block; width: 232px; max-height: 118px; object-fit: contain; object-position: left center; }
          .cobrand { display: flex; align-items: center; gap: 10px; padding-left: 18px; border-left: 1px solid #d9e4ef; }
          .cobrand span { color: #64748b; font-size: 9px; text-transform: uppercase; }
          .cobrand img { display: block; width: 112px; max-height: 58px; object-fit: contain; }
          .eyebrow { color: #0f766e; font-size: 10px; font-weight: 700; text-transform: uppercase; }
          .title-row { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; }
          h1 { margin-top: 8px; font-size: 30px; line-height: 1.05; }
          .subtitle { margin-top: 8px; color: #48627f; font-size: 13px; line-height: 1.4; }
          .scope-note { margin: -2px 0 8px; color: #64748b; font-size: 9px; line-height: 1.35; }
          .date { border: 1px solid #c8d7e7; border-radius: 8px; padding: 10px 12px; min-width: 132px; text-align: right; }
          .date strong, .date small { display: block; margin-top: 4px; }
          .date small { color: #64748b; font-size: 9px; }
          .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 16px 0; }
          .metric { border: 1px solid #c8d7e7; border-radius: 12px; padding: 11px; min-height: 78px; background: #f8fbfc; }
          .metric.warn { background: #fff8e8; border-color: #ead39c; }
          .metric span { display: block; color: #5b708c; font-size: 10px; text-transform: uppercase; }
          .metric strong { display: block; margin-top: 8px; font-size: 22px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
          .section { margin-bottom: 16px; }
          .avoid { break-inside: avoid-page; page-break-inside: avoid; }
          h2 { margin-bottom: 8px; font-size: 16px; }
          table { width: 100%; border-collapse: collapse; }
          thead { display: table-header-group; }
          th { background: #ecfeff; color: #182c4a; font-size: 10px; text-align: left; text-transform: uppercase; }
          th, td { border: 1px solid #d9e4ef; padding: 7px 8px; vertical-align: top; }
          tr { break-inside: avoid-page; page-break-inside: avoid; }
          td small { display: block; color: #64748b; margin-top: 2px; line-height: 1.25; }
          .number { text-align: right; white-space: nowrap; }
          .status { display: inline-block; width: 9px; height: 9px; border-radius: 999px; margin-right: 7px; }
          .status.muted { background: #94a3b8; }
          .status.ok { background: #65a30d; }
          .status.warn { background: #f59e0b; }
          .status.danger { background: #dc2626; }
          .coverage-state { display: inline-block; border-radius: 999px; padding: 3px 7px; font-size: 9px; font-weight: 700; white-space: nowrap; }
          .coverage-state.con-dato { color: #166534; background: #dcfce7; }
          .coverage-state.parcial { color: #155e75; background: #cffafe; }
          .coverage-state.sin-dato { color: #92400e; background: #fef3c7; }
          .coverage-state.no-consolidado { color: #475569; background: #e2e8f0; }
          .coverage-state.no-aplica { color: #64748b; background: #f1f5f9; }
          .note { border: 1px solid #c8d7e7; border-radius: 8px; background: #f8fbfd; padding: 10px; color: #48627f; line-height: 1.35; }
          .footer { margin-top: 18px; padding-top: 10px; border-top: 1px solid #d9e4ef; color: #64748b; font-size: 10px; }
          @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <main>
          <section class="cover">
            <div class="brand-row">
              <img class="chaman-logo" src="${this.escapeHtml(logoChaman)}" alt="Chaman Agro">
              ${
                logoDistribuidor
                  ? `<div class="cobrand"><span>Red asociada</span><img src="${this.escapeHtml(logoDistribuidor)}" alt="${this.escapeHtml(nombreDistribuidor)}"></div>`
                  : ''
              }
            </div>
            <div class="title-row">
              <div>
                <span class="eyebrow">Informe ejecutivo Chaman</span>
                <h1>${this.escapeHtml(nombreDistribuidor)}</h1>
                <p class="subtitle">Resumen operativo de productores asociados, lotes, hect&aacute;reas, cultivos y prioridades sanitarias.</p>
              </div>
              <div class="date"><span class="eyebrow">Corte del informe</span><strong>${fechaTexto}</strong><small>${this.escapeHtml(corteTexto)}</small></div>
            </div>
          </section>

          <section class="section avoid">
            <h2>Resumen ejecutivo</h2>
            <div class="metrics">
              <article class="metric"><span>Productores</span><strong>${this.formatNumber(this.productores.length)}</strong></article>
              <article class="metric"><span>Lotes</span><strong>${this.formatNumber(this.totalLotes)}</strong></article>
              <article class="metric"><span>Hect&aacute;reas</span><strong>${this.formatHa(this.totalHectareas)}</strong></article>
              <article class="metric warn"><span>Lotes con alerta operativa</span><strong>${this.formatNumber(this.lotesConAlerta)}</strong></article>
              <article class="metric"><span>Campanas vigentes</span><strong>${this.formatNumber(this.totalSiembrasActivas)}</strong></article>
              <article class="metric"><span>Cobertura sanitaria operativa</span><strong>${this.formatNumber(this.coberturaPrediccion)}%</strong></article>
              <article class="metric"><span>Lotes georreferenciados</span><strong>${this.formatNumber(this.lotesGeorreferenciados)}</strong></article>
              <article class="metric"><span>Estado sanitario</span><strong>${this.escapeHtml(this.estadoSanitario)}</strong></article>
            </div>
          </section>

          <section class="grid">
            <div class="section">
              <h2>Principales productores</h2>
              <p class="scope-note">Se muestran hasta 10 de ${this.formatNumber(this.productores.length)} productores del alcance.</p>
              <table><thead><tr><th>Productor</th><th>Lotes</th><th>Hect&aacute;reas</th><th>Alertas</th></tr></thead><tbody>${rowsProductores || '<tr><td colspan="4">Sin productores asociados.</td></tr>'}</tbody></table>
            </div>
            <div class="section">
              <h2>Principales cultivos</h2>
              <p class="scope-note">Ranking de hasta 10 cultivos por superficie monitoreada.</p>
              <table><thead><tr><th>Cultivo</th><th>Lotes</th><th>Hect&aacute;reas</th><th>Alertas</th></tr></thead><tbody>${rowsCultivos || '<tr><td colspan="4">Sin cultivos activos.</td></tr>'}</tbody></table>
            </div>
          </section>

          <section class="grid">
            <div class="section">
              <h2>Sanidad por hect&aacute;reas</h2>
              <table><thead><tr><th>Categor&iacute;a</th><th>Lotes</th><th>Hect&aacute;reas</th><th>%</th></tr></thead><tbody>${rowsSanidad}</tbody></table>
            </div>
            <div class="section">
              <h2>Prioridades sanitarias</h2>
              <p class="scope-note">Hasta 8 prioridades operativas, ordenadas por riesgo y superficie.</p>
              <table><thead><tr><th>Lote</th><th>Cultivo</th><th>Evento</th><th>Valor</th><th>ha</th></tr></thead><tbody>${rowsAlertas || '<tr><td colspan="5">Sin prioridades cr&iacute;ticas.</td></tr>'}</tbody></table>
            </div>
          </section>

          <section class="section">
            <h2>Cobertura de servicios Chaman</h2>
            <table>
              <thead><tr><th>Servicio</th><th>Estado en este informe</th><th>Alcance comprobado</th></tr></thead>
              <tbody>${rowsCobertura}</tbody>
            </table>
          </section>

          <section class="section">
            <div class="note">
              La sanidad ejecutiva utiliza exclusivamente lecturas operativas, vigentes y con trazabilidad suficiente. Las lecturas no agregables por validaci&oacute;n, calidad, resistencia o vigencia permanecen auditables, pero no elevan alertas, hect&aacute;reas ni prioridades. "No consolidado" significa que el servicio existe en el detalle del lote, pero sus datos no forman parte de esta consulta agregada.
            </div>
          </section>

          <footer class="footer">Chaman Agro - Informe ejecutivo generado autom&aacute;ticamente. Corte: ${this.escapeHtml(corteTexto)}.</footer>
        </main>
        <script>
          document.title = ${JSON.stringify(nombreArchivo)};
          async function imprimirCuandoListo() {
            const imagenes = Array.from(document.images);
            await Promise.all(imagenes.map((imagen) => {
              const timeout = new Promise((resolve) => setTimeout(resolve, 2500));
              if (imagen.complete) {
                const decode = typeof imagen.decode === 'function' ? imagen.decode().catch(() => undefined) : Promise.resolve();
                return Promise.race([decode, timeout]);
              }
              const carga = new Promise((resolve) => {
                imagen.addEventListener('load', resolve, { once: true });
                imagen.addEventListener('error', resolve, { once: true });
              });
              return Promise.race([carga, timeout]);
            }));
            if (document.fonts && document.fonts.ready) {
              await Promise.race([
                document.fonts.ready.catch(() => undefined),
                new Promise((resolve) => setTimeout(resolve, 2500)),
              ]);
            }
            setTimeout(() => window.print(), 80);
          }
          window.addEventListener('load', () => void imprimirCuandoListo(), { once: true });
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
        titulo: 'Datos pendientes',
        descripcion: 'Precaucion: falta una lectura sanitaria vigente',
        clase: 'warn',
        hectareas: 0,
        lotes: 0,
        porcentaje: 0,
      },
    ];
  }

  private obtenerUltimasSiembrasPorLote(): Map<string, ISiembra> {
    const map = new Map<string, ISiembra>();
    const vistos = new Set<string>();
    const ordenadas = [...this.siembras].sort((a, b) => {
      const fechaA = new Date(a.fechaSiembra || '').getTime() || 0;
      const fechaB = new Date(b.fechaSiembra || '').getTime() || 0;
      return fechaB - fechaA;
    });

    ordenadas.forEach((siembra) => {
      const idLote = siembra.idLote || siembra.lote?._id;
      if (!idLote || vistos.has(idLote)) return;
      vistos.add(idLote);
      if (this.esSiembraVigente(siembra)) {
        map.set(idLote, siembra);
      }
    });

    return map;
  }

  private cultivoSiembra(siembra?: ISiembra): string {
    return siembra?.semilla?.cultivo || 'Sin cultivo';
  }

  private nivelRiesgo(siembra?: ISiembra): NivelRiesgoSanitario {
    if (!siembra?.ultimaPrediccion) {
      return 'sin-prediccion';
    }

    const evaluacion = this.evaluacionSanitaria(siembra);
    if (!evaluacion.operativas.length) {
      return 'sin-prediccion';
    }
    if (evaluacion.semaforo === 'rojo') return 'alto';
    if (evaluacion.semaforo === 'amarillo') return 'medio';
    return 'bajo';
  }

  private alertaPrincipal(siembra?: ISiembra): { enfermedad: string; resultado: number } | null {
    const evaluacion = this.evaluacionSanitaria(siembra);
    if (!evaluacion.principal) {
      return null;
    }
    const principal = evaluacion.principal;
    return {
      enfermedad: principal.enfermedad || 'Enfermedad',
      resultado: principal.resultado || 0,
    };
  }

  private agregarResumen(
    map: Map<string, IResumenRanking>,
    id: string | undefined,
    nombre: string,
    hectareas: number,
    alerta: boolean
  ): void {
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
    this.lotesOperativos = operativos.sort(
      (a, b) => this.ordenRiesgo(b.nivel) - this.ordenRiesgo(a.nivel) || b.hectareas - a.hectareas
    );

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
    return 'Informacion pendiente';
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
    return 'warn';
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
    const estado = estadoSanidadSemaforo(nivel);
    return {
      fill: COLOR_SEMAFORO_MAPA[estado],
      stroke: BORDE_SEMAFORO_MAPA[estado],
    };
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
      layers: [
        OpenLayersService.mapTileSatelite(17),
        OpenLayersService.mapReferenciasPoliticas(),
        this.lotesLayer,
        this.puntosLayer,
      ],
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

  private safeImageUrl(value?: string): string {
    if (!value) {
      return '';
    }
    if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(value)) {
      return value;
    }
    try {
      const url = new URL(value, document.baseURI);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  }

  private esSiembraVigente(siembra: ISiembra): boolean {
    if (siembra.fechaCosecha || siembra.activa === false) {
      return false;
    }
    const perenne = siembra.semilla?.tipoCultivo === 'Perenne' || esCultivoPerenne(siembra.semilla?.cultivo);
    if (perenne || siembra.activa === true) {
      return true;
    }
    const fechaSiembra = new Date(siembra.fechaSiembra || '').getTime();
    if (!Number.isFinite(fechaSiembra)) {
      return false;
    }
    const antiguedadDias = (Date.now() - fechaSiembra) / (24 * 60 * 60 * 1000);
    // Compatibilidad con campañas 2025/2026 sin convertir un anual legacy
    // indefinido en cultivo activo para siempre.
    return antiguedadDias >= -31 && antiguedadDias <= 548;
  }

  private enfermedadesOperativas(siembra?: ISiembra) {
    return this.evaluacionSanitaria(siembra).operativas;
  }

  private evaluacionSanitaria(siembra?: ISiembra) {
    const fecha = siembra?.ultimaPrediccion?.fechaPrediccion || siembra?.ultimaPrediccion?.fecha;
    return evaluarSanidadAgregada(
      siembra?.ultimaPrediccion?.enfermedades || [],
      siembra?.semilla?.cultivo,
      fecha
    );
  }

  private filaCobertura(servicio: string, estado: EstadoCoberturaServicio, detalle: string): ICoberturaServicio {
    const etiquetas: Record<EstadoCoberturaServicio, ICoberturaServicio['etiqueta']> = {
      'con-dato': 'Con dato',
      parcial: 'Parcial',
      'sin-dato': 'Sin dato',
      'no-consolidado': 'No consolidado',
      'no-aplica': 'No aplica',
    };
    return { servicio, estado, etiqueta: etiquetas[estado], detalle };
  }

  private construirCoberturaServicios(): ICoberturaServicio[] {
    const siembrasVigentes = [...this.obtenerUltimasSiembrasPorLote().values()];
    const totalVigentes = siembrasVigentes.length;
    const totalLotes = this.lotes.length;
    const perennes = siembrasVigentes.filter(
      (siembra) => siembra.semilla?.tipoCultivo === 'Perenne' || esCultivoPerenne(siembra.semilla?.cultivo)
    ).length;
    const conUbicacion = this.lotes.filter(
      (lote) => !!lote.ubicacion?.geojson?.coordinates?.length || !!lote.ubicacion?.centro
    ).length;
    const conClima = this.lotes.filter(
      (lote) =>
        !!lote.calidadClima?.fecha ||
        (typeof lote.calidadClima?.nivel === 'number' && Number.isFinite(lote.calidadClima.nivel))
    ).length;
    const conSanidad = siembrasVigentes.filter((siembra) => this.enfermedadesOperativas(siembra).length > 0).length;
    const soloNoAgregable = siembrasVigentes.filter((siembra) => {
      const todas = siembra.ultimaPrediccion?.enfermedades || [];
      return todas.length > 0 && this.enfermedadesOperativas(siembra).length === 0;
    }).length;
    const conRiego = siembrasVigentes.filter(
      (siembra) =>
        ['calculada', 'estimada'].includes(siembra.estadoRecomendacionRiego || '') &&
        (siembra.ultimaPrediccionRiego || []).some(
          (item) => typeof item.cantidad === 'number' && Number.isFinite(item.cantidad) && item.cantidad >= 0
        )
    ).length;
    const conMalezas = siembrasVigentes.filter((siembra) =>
      esPrediccionMalezasOperativa(siembra.ultimaPrediccionMalezas)
    ).length;
    const malezasNoAplica = siembrasVigentes.filter(
      (siembra) => siembra.ultimaPrediccionMalezas?.estado === 'no_aplica'
    ).length;
    const conHuella = siembrasVigentes.filter((siembra) =>
      esHuellaHidricaConsolidada(siembra.huellaHidrica || siembra.lote?.huellaHidrica)
    ).length;
    const conSensores = this.lotes.filter(
      (lote) => !!lote.idSondaSuelo || !!lote.serialCamara || !!lote.idsDispositivo?.length
    ).length;
    const estadoPorConteo = (cantidad: number, total: number): EstadoCoberturaServicio => {
      if (!total) return 'no-aplica';
      if (cantidad <= 0) return 'sin-dato';
      return cantidad >= total ? 'con-dato' : 'parcial';
    };

    return [
      this.filaCobertura(
        'Ubicaci\u00f3n y cartograf\u00eda',
        estadoPorConteo(conUbicacion, totalLotes),
        `${conUbicacion} de ${totalLotes} lotes con geometr\u00eda o centro georreferenciado.`
      ),
      this.filaCobertura(
        'Suelo y ambiente',
        'no-consolidado',
        'El motor edafico INTA + SoilGrids se consulta por lote. Esta vista agregada no recibe lot_soil_assessments y no infiere ausencia de suelo.'
      ),
      this.filaCobertura(
        'Fenolog\u00eda y campa\u00f1a',
        estadoPorConteo(totalVigentes, totalLotes),
        `${totalVigentes} siembras o plantaciones vigentes; ${perennes} perennes conservadas sin recorte por antiguedad.`
      ),
      this.filaCobertura(
        'Monitoreo sanitario',
        estadoPorConteo(conSanidad, totalVigentes),
        `${conSanidad} de ${totalVigentes} vigentes con lectura operativa reciente. ${soloNoAgregable} con lectura no agregable por validacion, calidad, trazabilidad o vigencia; no eleva el riesgo ejecutivo.`
      ),
      this.filaCobertura(
        'Riego',
        estadoPorConteo(conRiego, totalVigentes),
        `${conRiego} de ${totalVigentes} vigentes con recomendaci\u00f3n calculada/estimada y cantidad v\u00e1lida.`
      ),
      this.filaCobertura(
        'Malezas',
        estadoPorConteo(conMalezas, Math.max(0, totalVigentes - malezasNoAplica)),
        `${conMalezas} predicci\u00f3n(es) operativa(s); ${malezasNoAplica} siembra(s) donde el motor inform\u00f3 que no aplica.`
      ),
      this.filaCobertura(
        'Huella hidrica',
        estadoPorConteo(conHuella, totalVigentes),
        `${conHuella} de ${totalVigentes} vigentes con resultado de huella hidrica.`
      ),
      this.filaCobertura(
        'Clima observado y calidad climatica',
        estadoPorConteo(conClima, totalLotes),
        `${conClima} de ${totalLotes} lotes con calidad climatica persistida.`
      ),
      this.filaCobertura(
        'Camaras y sensores',
        estadoPorConteo(conSensores, totalLotes),
        `${conSensores} de ${totalLotes} lotes con camara, sonda o dispositivo asociado.`
      ),
      this.filaCobertura(
        '\u00cdndices satelitales',
        'no-consolidado',
        'Las escenas e indices se consultan por lote; este tablero no recibe su serie historica.'
      ),
      this.filaCobertura(
        'C\u00e1lculos agrometeorol\u00f3gicos',
        'no-consolidado',
        'Los acumulados y curvas se calculan por lote y no se agregan en este alcance.'
      ),
      this.filaCobertura(
        'Helada, granizo y riesgos agroclimaticos',
        'no-consolidado',
        'Los eventos se evalúan por coordenada y ventana temporal; no se infieren desde este resumen.'
      ),
      this.filaCobertura(
        'Viento y ventana de aplicacion',
        'no-consolidado',
        'La recomendaci\u00f3n horaria permanece en el detalle del lote.'
      ),
      this.filaCobertura(
        'Labores, fertilizaciones y aplicaciones',
        'no-consolidado',
        'Los registros operativos no forman parte de la consulta agregada de este informe.'
      ),
      this.filaCobertura(
        'Nivel freatico',
        'no-consolidado',
        'La consulta regional se presenta por lote y no se extrapola a toda la red.'
      ),
    ];
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
      select: 'nombre logo direccion geojson idQuimica',
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
    const populate = [
      {
        path: 'semilla',
        select: 'cultivo variedad tipoCultivo',
      },
      {
        path: 'lote',
        select:
          'nombre ubicacion huellaHidrica.total huellaHidrica.verde.litrosKg huellaHidrica.azul.litrosKg huellaHidrica.gris.litrosKg',
      },
    ];
    const query: IQueryParam = {
      sort: '-fechaSiembra',
      populate: JSON.stringify(populate),
      select:
        'fechaSiembra fechaCosecha activa idProductor idDistribuidor idEstablecimiento idLote ultimaPrediccion ultimaPrediccionRiego.cantidad ultimaPrediccionMalezas.estado ultimaPrediccionMalezas.especies._id estadoRecomendacionRiego huellaHidrica.total huellaHidrica.verde.litrosKg huellaHidrica.azul.litrosKg huellaHidrica.gris.litrosKg idSemilla lote',
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
      select:
        'nombre idDistribuidor idProductor ubicacion calidadClima.fecha calidadClima.nivel idSondaSuelo serialCamara idsDispositivo huellaHidrica.total huellaHidrica.verde.litrosKg huellaHidrica.azul.litrosKg huellaHidrica.gris.litrosKg',
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
