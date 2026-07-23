import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import {
  clasificarNivelRiesgoSanitario,
  esCultivoPerenne,
  esFechaPrediccionSanitariaReciente,
  esLecturaSanitariaOperativa,
  esPrediccionMalezasOperativa,
  esHuellaHidricaConsolidada,
  IDistribuidor,
  IEstablecimiento,
  IListado,
  ILote,
  IProductor,
  IQueryParam,
  ISiembra,
} from 'modelos/src';
import { Feature, Map as OlMap, View } from 'ol';
import { FeatureLike } from 'ol/Feature';
import { Point } from 'ol/geom';
import VectorLayer from 'ol/layer/Vector';
import { fromLonLat } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import CircleStyle from 'ol/style/Circle';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import Style from 'ol/style/Style';
import { Subscription } from 'rxjs';
import { ChartComponent } from '../../../auxiliares/componentes/chart/chart.component';
import { QuimicaService } from '../../../auxiliares/http/quimica.service';
import { HelperService } from '../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../auxiliares/servicios/listados';
import { OpenLayersService } from '../../../auxiliares/servicios/openLayers.service';
import { SharedModule } from '../../../auxiliares/shared.module';

interface IResumenCultivo {
  cultivo: string;
  hectareas: number;
  lotes: number;
}

interface IResumenDistribuidor {
  id: string;
  nombre: string;
  direccion: string;
  geojson?: IDistribuidor['geojson'];
  productores: number;
  lotes: number;
  siembras: number;
  hectareas: number;
  hectareasConAlerta: number;
  riesgoBajo: number;
  riesgoMedio: number;
  riesgoAlto: number;
  sinPrediccion: number;
  cultivos: IResumenCultivo[];
}

type NivelRiesgoSanitario = 'sin-prediccion' | 'bajo' | 'medio' | 'alto';

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
  imports: [SharedModule, ChartComponent],
})
export class DashboardQuimicaComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('distribuidoresMap') private distribuidoresMap?: ElementRef<HTMLDivElement>;

  public loading = true;
  public nombreCompania = 'Compañía';
  public logoCompania = '';

  public siembras: ISiembra[] = [];
  public distribuidores: IDistribuidor[] = [];
  public productores: IProductor[] = [];
  public lotes: ILote[] = [];
  public establecimientos: IEstablecimiento[] = [];

  public resumenDistribuidores: IResumenDistribuidor[] = [];
  public distribuidorSeleccionado?: IResumenDistribuidor;
  public cultivosResumen: IResumenCultivo[] = [];

  public totalDistribuidores = 0;
  public distribuidoresConUbicacion = 0;
  public totalProductores = 0;
  public totalLotes = 0;
  public totalHectareas = 0;
  public hectareasConAlerta = 0;
  public hectareasSinPrediccion = 0;
  public cultivosActivos = 0;

  public riegosEnfermedadPorHectarea = {
    nada: 0,
    bajo: 0,
    medio: 0,
    alto: 0,
  };

  public chartHasPorDistribuidor?: Highcharts.Options;
  public chartHasPorCultivo?: Highcharts.Options;
  public chartRiesgoSanitario?: Highcharts.Options;

  public siembras$?: Subscription;
  public productores$?: Subscription;
  public distribuidores$?: Subscription;
  public lotes$?: Subscription;
  public establecimientos$?: Subscription;

  private map?: OlMap;
  private distribuidoresSource = new VectorSource();
  private distribuidoresLayer = new VectorLayer({
    source: this.distribuidoresSource,
    style: (feature) => this.estiloDistribuidor(feature),
  });

  constructor(
    private listadosService: ListadosService,
    private helper: HelperService,
    private quimicaService: QuimicaService,
    private translate: TranslateService,
    private activatedRoute: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  public crearAsesor(): void {
    void this.router.navigate(['/usuarios/crear/asesor']);
  }

  public seleccionarDistribuidor(resumen?: IResumenDistribuidor): void {
    this.distribuidorSeleccionado = resumen;
    this.distribuidoresLayer.changed();
    this.cdr.detectChanges();
  }

  public centrarDistribuidor(resumen: IResumenDistribuidor, event?: Event): void {
    event?.stopPropagation();
    this.seleccionarDistribuidor(resumen);

    const coordinates = this.coordenadasDistribuidor(resumen);
    if (!coordinates || !this.map) {
      return;
    }

    this.distribuidoresMap?.nativeElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });

    setTimeout(() => {
      this.map?.updateSize();
      this.map?.getView().animate({
        center: fromLonLat(coordinates),
        zoom: 12,
        duration: 350,
      });
    }, 120);
  }

  public exportarInformeEjecutivo(): void {
    const fecha = new Date();
    const fechaTexto = fecha.toLocaleDateString('es-AR');
    const corteTexto = fecha.toLocaleString('es-AR', {
      dateStyle: 'long',
      timeStyle: 'short',
    });
    const logoChaman = this.safeImageUrl(new URL('/images/logo-light.png', document.baseURI).href);
    const logoCompania = this.safeImageUrl(this.logoCompania);
    const coberturaServicios = this.construirCoberturaServicios();
    const nombreArchivo = `informe-${this.nombreCompania || 'compania'}-${fecha.toISOString().slice(0, 10)}`
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

    const principalesCultivos = this.cultivosResumen.slice(0, 12);
    const principalesDistribuidores = this.resumenDistribuidores
      .filter((resumen) => resumen.hectareas > 0 || resumen.productores > 0 || resumen.lotes > 0)
      .slice(0, 25);
    const distribuidoresSinActividad = this.resumenDistribuidores.filter(
      (resumen) => resumen.hectareas === 0 && resumen.productores === 0 && resumen.lotes === 0
    ).length;

    const resumenSanitario = [
      { categoria: 'Sin prediccion', hectareas: this.riegosEnfermedadPorHectarea.nada, clase: 'muted' },
      { categoria: 'Riesgo bajo', hectareas: this.riegosEnfermedadPorHectarea.bajo, clase: 'ok' },
      { categoria: 'Riesgo medio', hectareas: this.riegosEnfermedadPorHectarea.medio, clase: 'warn' },
      { categoria: 'Riesgo alto', hectareas: this.riegosEnfermedadPorHectarea.alto, clase: 'danger' },
    ];

    const rowsCultivos = principalesCultivos
      .map(
        (cultivo) => `
          <tr>
            <td>${this.escapeHtml(cultivo.cultivo)}</td>
            <td class="number">${this.formatNumber(cultivo.lotes)}</td>
            <td class="number">${this.formatHa(cultivo.hectareas)}</td>
            <td>
              <div class="bar"><span style="width:${this.porcentajeHectareas(cultivo.hectareas)}%"></span></div>
            </td>
          </tr>`
      )
      .join('');

    const rowsSanidad = resumenSanitario
      .map(
        (item) => `
          <tr>
            <td><span class="status ${item.clase}"></span>${this.escapeHtml(item.categoria)}</td>
            <td class="number">${this.formatHa(item.hectareas)}</td>
            <td class="number">${this.porcentajeHectareas(item.hectareas)}%</td>
          </tr>`
      )
      .join('');

    const rowsDistribuidores = principalesDistribuidores
      .map(
        (resumen, index) => `
          <tr>
            <td class="number">${index + 1}</td>
            <td>
              <strong>${this.escapeHtml(resumen.nombre)}</strong>
              <small>${this.escapeHtml(resumen.direccion || 'Sin direccion cargada')}</small>
            </td>
            <td class="number">${this.formatNumber(resumen.productores)}</td>
            <td class="number">${this.formatNumber(resumen.lotes)}</td>
            <td class="number">${this.formatHa(resumen.hectareas)}</td>
            <td class="number">${this.formatHa(resumen.hectareasConAlerta)}</td>
            <td>${this.escapeHtml(this.cultivosTexto(resumen))}</td>
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
          h1, h2, h3, p { margin: 0; }
          .cover { border-bottom: 4px solid #2dd4bf; padding-bottom: 18px; margin-bottom: 18px; }
          .brand-row { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 82px; margin-bottom: 12px; }
          .chaman-logo { display: block; width: 232px; max-height: 118px; object-fit: contain; object-position: left center; }
          .cobrand { display: flex; align-items: center; gap: 10px; padding-left: 18px; border-left: 1px solid #d9e4ef; }
          .cobrand span { color: #64748b; font-size: 9px; text-transform: uppercase; }
          .cobrand img { display: block; width: 112px; max-height: 58px; object-fit: contain; }
          .eyebrow { color: #0f766e; font-size: 10px; font-weight: 700; letter-spacing: 0; text-transform: uppercase; }
          .title-row { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; }
          h1 { margin-top: 8px; font-size: 30px; line-height: 1.05; }
          .subtitle { margin-top: 8px; color: #48627f; font-size: 13px; line-height: 1.4; }
          .scope-note { margin: -2px 0 8px; color: #64748b; font-size: 9px; line-height: 1.35; }
          .date { border: 1px solid #c8d7e7; border-radius: 8px; padding: 10px 12px; min-width: 132px; text-align: right; }
          .date strong, .date small { display: block; margin-top: 4px; }
          .date small { color: #64748b; font-size: 9px; }
          .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
          .metric { border: 1px solid #c8d7e7; border-left: 4px solid #2dd4bf; border-radius: 8px; padding: 11px; min-height: 78px; }
          .metric.warn { border-left-color: #f59e0b; }
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
          .bar { width: 100%; height: 8px; border-radius: 999px; background: #e4edf6; overflow: hidden; }
          .bar span { display: block; height: 100%; background: #2dd4bf; }
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
          @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <main>
          <section class="cover">
            <div class="brand-row">
              <img class="chaman-logo" src="${this.escapeHtml(logoChaman)}" alt="Chaman Agro">
              ${
                logoCompania
                  ? `<div class="cobrand"><span>Informe para</span><img src="${this.escapeHtml(logoCompania)}" alt="${this.escapeHtml(this.nombreCompania)}"></div>`
                  : ''
              }
            </div>
            <div class="title-row">
              <div>
                <span class="eyebrow">Informe ejecutivo Chaman</span>
                <h1>${this.escapeHtml(this.nombreCompania)}</h1>
                <p class="subtitle">Resumen corporativo de red comercial, productores, lotes, hect&aacute;reas monitoreadas, cultivos y sanidad.</p>
              </div>
              <div class="date">
                <span class="eyebrow">Corte del informe</span>
                <strong>${fechaTexto}</strong>
                <small>${this.escapeHtml(corteTexto)}</small>
              </div>
            </div>
          </section>

          <section class="section avoid">
            <h2>Resumen ejecutivo</h2>
            <div class="metrics">
              <article class="metric"><span>Distribuidores</span><strong>${this.formatNumber(this.totalDistribuidores)}</strong></article>
              <article class="metric"><span>Productores</span><strong>${this.formatNumber(this.totalProductores)}</strong></article>
              <article class="metric"><span>Lotes</span><strong>${this.formatNumber(this.totalLotes)}</strong></article>
              <article class="metric warn"><span>Hect&aacute;reas con alerta operativa</span><strong>${this.formatHa(this.hectareasConAlerta)}</strong></article>
              <article class="metric"><span>Hect&aacute;reas monitoreadas</span><strong>${this.formatHa(this.totalHectareas)}</strong></article>
              <article class="metric"><span>Cultivos vigentes</span><strong>${this.formatNumber(this.cultivosActivos)}</strong></article>
              <article class="metric"><span>Distribuidores geolocalizados</span><strong>${this.formatNumber(this.distribuidoresConUbicacion)}</strong></article>
              <article class="metric"><span>Sin actividad vinculada</span><strong>${this.formatNumber(distribuidoresSinActividad)}</strong></article>
            </div>
          </section>

          <section class="grid">
            <div class="section">
              <h2>Principales cultivos por hectarea</h2>
              <p class="scope-note">Se muestran hasta 12 cultivos; los totales ejecutivos incluyen el alcance completo.</p>
              <table>
                <thead><tr><th>Cultivo</th><th>Lotes</th><th>Hect&aacute;reas</th><th>Participaci&oacute;n</th></tr></thead>
                <tbody>${rowsCultivos || '<tr><td colspan="4">Sin cultivos asociados.</td></tr>'}</tbody>
              </table>
            </div>
            <div class="section">
              <h2>Riesgo sanitario</h2>
              <table>
                <thead><tr><th>Categor&iacute;a</th><th>Hect&aacute;reas</th><th>%</th></tr></thead>
                <tbody>${rowsSanidad}</tbody>
              </table>
            </div>
          </section>

          <section class="section">
            <h2>Distribuidores con actividad monitoreada</h2>
            <p class="scope-note">Se muestran hasta 25 distribuidores con actividad; los indicadores superiores consideran toda la red visible.</p>
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Distribuidor</th><th>Productores</th><th>Lotes</th><th>Hect&aacute;reas</th><th>Alerta</th><th>Cultivos principales</th>
                </tr>
              </thead>
              <tbody>${rowsDistribuidores || '<tr><td colspan="7">Todav&iacute;a no hay productores o lotes asociados a estos distribuidores.</td></tr>'}</tbody>
            </table>
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
              El informe se calcula con el alcance visible para la compa&ntilde;&iacute;a activa. La sanidad ejecutiva utiliza exclusivamente lecturas operativas, vigentes y con trazabilidad suficiente. Las lecturas no agregables por validaci&oacute;n, calidad, resistencia o vigencia permanecen auditables, pero no elevan alertas ni hect&aacute;reas. "No consolidado" significa que el servicio existe en el lote, pero no se incluye en esta consulta agregada.
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

  public trackByDistribuidor(_: number, item: IResumenDistribuidor): string {
    return item.id;
  }

  public trackByCultivo(_: number, item: IResumenCultivo): string {
    return item.cultivo;
  }

  public porcentajeHectareas(hectareas: number): number {
    if (!this.totalHectareas) {
      return 0;
    }
    return Math.min(100, Math.round((hectareas / this.totalHectareas) * 100));
  }

  public cultivosTexto(resumen: IResumenDistribuidor): string {
    if (!resumen.cultivos.length) {
      return 'Sin cultivos activos';
    }
    return resumen.cultivos
      .slice(0, 3)
      .map((cultivo) => `${cultivo.cultivo} ${Math.round(cultivo.hectareas)} ha`)
      .join(' - ');
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
    const fecha = siembra?.ultimaPrediccion?.fechaPrediccion || siembra?.ultimaPrediccion?.fecha;
    if (!esFechaPrediccionSanitariaReciente(fecha)) {
      return [];
    }
    return (siembra?.ultimaPrediccion?.enfermedades || []).filter((enfermedad) =>
      esLecturaSanitariaOperativa(enfermedad)
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

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value || 0);
  }

  private formatHa(value: number): string {
    return `${this.formatNumber(Math.round(value || 0))} ha`;
  }

  private crearGraficoTorta(data: Highcharts.PointOptionsObject[]): Highcharts.Options {
    return {
      chart: {
        type: 'pie',
        backgroundColor: 'transparent',
        style: { fontFamily: 'Lato, sans-serif' },
      },
      credits: { enabled: false },
      title: { text: undefined },
      legend: {
        enabled: true,
        layout: 'vertical',
        align: 'right',
        verticalAlign: 'middle',
        itemStyle: {
          color: 'var(--p-text-color)',
          fontWeight: '600',
        },
      },
      tooltip: {
        pointFormat: '<b>{point.y:.0f} ha</b>',
      },
      plotOptions: {
        pie: {
          showInLegend: true,
          dataLabels: { enabled: false },
          borderWidth: 0,
        },
      },
      series: [
        {
          type: 'pie',
          data,
        },
      ],
    };
  }

  private actualizarGraficos(): void {
    const distribuidoresData = this.resumenDistribuidores
      .filter((item) => item.hectareas > 0)
      .slice(0, 10)
      .map((item) => ({
        name: item.nombre,
        y: Math.round(item.hectareas),
      }));

    const cultivosData = this.cultivosResumen
      .filter((item) => item.hectareas > 0)
      .map((item) => ({
        name: item.cultivo,
        y: Math.round(item.hectareas),
      }));

    const riesgoData = [
      { name: this.translate.instant('Sin prediccion'), y: Math.round(this.riegosEnfermedadPorHectarea.nada) },
      { name: this.translate.instant('Riesgo bajo'), y: Math.round(this.riegosEnfermedadPorHectarea.bajo) },
      { name: this.translate.instant('Riesgo medio'), y: Math.round(this.riegosEnfermedadPorHectarea.medio) },
      { name: this.translate.instant('Riesgo alto'), y: Math.round(this.riegosEnfermedadPorHectarea.alto) },
    ].filter((item) => item.y > 0);

    this.chartHasPorDistribuidor = this.crearGraficoTorta(distribuidoresData);
    this.chartHasPorCultivo = this.crearGraficoTorta(cultivosData);
    this.chartRiesgoSanitario = this.crearGraficoTorta(riesgoData);
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

    const enfermedades = this.enfermedadesOperativas(siembra);
    if (!enfermedades.length) {
      return 'sin-prediccion';
    }
    const maximo = enfermedades.reduce((max, enfermedad) => Math.max(max, enfermedad.resultado || 0), 0);
    return clasificarNivelRiesgoSanitario(maximo, siembra.semilla?.cultivo);
  }

  private agregarCultivo(resumenes: Map<string, IResumenCultivo>, cultivo: string, hectareas: number): void {
    const actual = resumenes.get(cultivo) || { cultivo, hectareas: 0, lotes: 0 };
    actual.hectareas += hectareas;
    actual.lotes += 1;
    resumenes.set(cultivo, actual);
  }

  private recomputarResumen(): void {
    const resumenPorDistribuidor = new Map<string, IResumenDistribuidor>();
    const ultimasSiembrasPorLote = this.obtenerUltimasSiembrasPorLote();
    const cultivosGlobal = new Map<string, IResumenCultivo>();

    this.distribuidores.forEach((distribuidor) => {
      const id = distribuidor._id || distribuidor.nombre || '';
      if (!id) {
        return;
      }
      resumenPorDistribuidor.set(id, {
        id,
        nombre: distribuidor.nombre || 'Sin nombre',
        direccion: distribuidor.direccion || '',
        geojson: distribuidor.geojson,
        productores: 0,
        lotes: 0,
        siembras: 0,
        hectareas: 0,
        hectareasConAlerta: 0,
        riesgoBajo: 0,
        riesgoMedio: 0,
        riesgoAlto: 0,
        sinPrediccion: 0,
        cultivos: [],
      });
    });

    this.productores.forEach((productor) => {
      const idDistribuidor = productor.idDistribuidor || '';
      const resumen = resumenPorDistribuidor.get(idDistribuidor);
      if (resumen) {
        resumen.productores += 1;
      }
    });

    this.totalHectareas = 0;
    this.hectareasConAlerta = 0;
    this.hectareasSinPrediccion = 0;
    this.riegosEnfermedadPorHectarea = {
      nada: 0,
      bajo: 0,
      medio: 0,
      alto: 0,
    };

    const cultivosPorDistribuidor = new Map<string, Map<string, IResumenCultivo>>();

    this.lotes.forEach((lote) => {
      const idDistribuidor = lote.idDistribuidor || '';
      const resumen = resumenPorDistribuidor.get(idDistribuidor);
      const hectareas = lote.ubicacion?.superficie || 0;
      const siembra = lote._id ? ultimasSiembrasPorLote.get(lote._id) : undefined;
      const cultivo = this.cultivoSiembra(siembra);
      const riesgo = this.nivelRiesgo(siembra);

      this.totalHectareas += hectareas;
      if (siembra) {
        this.agregarCultivo(cultivosGlobal, cultivo, hectareas);
      }

      if (riesgo === 'sin-prediccion') {
        this.riegosEnfermedadPorHectarea.nada += hectareas;
        this.hectareasSinPrediccion += hectareas;
      } else if (riesgo === 'bajo') {
        this.riegosEnfermedadPorHectarea.bajo += hectareas;
      } else if (riesgo === 'medio') {
        this.riegosEnfermedadPorHectarea.medio += hectareas;
        this.hectareasConAlerta += hectareas;
      } else if (riesgo === 'alto') {
        this.riegosEnfermedadPorHectarea.alto += hectareas;
        this.hectareasConAlerta += hectareas;
      }

      if (!resumen) {
        return;
      }

      resumen.lotes += 1;
      resumen.hectareas += hectareas;
      resumen.siembras += siembra ? 1 : 0;

      if (riesgo === 'sin-prediccion') {
        resumen.sinPrediccion += hectareas;
      } else if (riesgo === 'bajo') {
        resumen.riesgoBajo += hectareas;
      } else if (riesgo === 'medio') {
        resumen.riesgoMedio += hectareas;
        resumen.hectareasConAlerta += hectareas;
      } else if (riesgo === 'alto') {
        resumen.riesgoAlto += hectareas;
        resumen.hectareasConAlerta += hectareas;
      }

      if (siembra) {
        if (!cultivosPorDistribuidor.has(resumen.id)) {
          cultivosPorDistribuidor.set(resumen.id, new Map<string, IResumenCultivo>());
        }
        this.agregarCultivo(cultivosPorDistribuidor.get(resumen.id)!, cultivo, hectareas);
      }
    });

    this.resumenDistribuidores = [...resumenPorDistribuidor.values()]
      .map((resumen) => ({
        ...resumen,
        cultivos: [...(cultivosPorDistribuidor.get(resumen.id)?.values() || [])].sort(
          (a, b) => b.hectareas - a.hectareas
        ),
      }))
      .sort((a, b) => b.hectareas - a.hectareas || b.productores - a.productores || a.nombre.localeCompare(b.nombre));

    this.cultivosResumen = [...cultivosGlobal.values()].sort((a, b) => b.hectareas - a.hectareas);
    this.totalDistribuidores = this.distribuidores.length;
    this.distribuidoresConUbicacion = this.distribuidores.filter((distribuidor) =>
      this.coordenadasDistribuidor(distribuidor)
    ).length;
    this.totalProductores = this.productores.length;
    this.totalLotes = this.lotes.length;
    this.cultivosActivos = this.cultivosResumen.filter((item) => item.cultivo !== 'Sin cultivo').length;

    if (this.distribuidorSeleccionado) {
      this.distribuidorSeleccionado = this.resumenDistribuidores.find(
        (item) => item.id === this.distribuidorSeleccionado?.id
      );
    }

    this.actualizarGraficos();
    this.redibujarDistribuidores();
  }

  private coordenadasDistribuidor(distribuidor: { geojson?: IDistribuidor['geojson'] }): [number, number] | null {
    const coordinates = distribuidor.geojson?.coordinates;
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

  private estiloDistribuidor(feature: FeatureLike): Style {
    const resumen = feature.get('resumen') as IResumenDistribuidor | undefined;
    const seleccionado = resumen?.id === this.distribuidorSeleccionado?.id;
    const tieneActividad = !!resumen && (resumen.productores > 0 || resumen.hectareas > 0);

    return new Style({
      image: new CircleStyle({
        radius: seleccionado ? 9 : tieneActividad ? 7 : 5,
        fill: new Fill({ color: seleccionado ? '#2dd4bf' : tieneActividad ? '#1f9d55' : '#22324a' }),
        stroke: new Stroke({
          color: '#ffffff',
          width: seleccionado ? 3 : 2,
        }),
      }),
    });
  }

  private redibujarDistribuidores(): void {
    this.distribuidoresSource.clear();

    this.resumenDistribuidores.forEach((resumen) => {
      const coordinates = this.coordenadasDistribuidor(resumen);
      if (!coordinates) {
        return;
      }

      const feature = new Feature({
        geometry: new Point(fromLonLat(coordinates)),
      });
      feature.setId(resumen.id);
      feature.set('resumen', resumen);
      this.distribuidoresSource.addFeature(feature);
    });

    if (!this.map || this.distribuidoresSource.isEmpty()) {
      return;
    }

    const extent = this.distribuidoresSource.getExtent();
    this.map.getView().fit(extent, {
      padding: [36, 36, 36, 36],
      maxZoom: 8,
      duration: 250,
    });
  }

  private inicializarMapa(): void {
    if (!this.distribuidoresMap?.nativeElement || this.map) {
      return;
    }

    this.map = new OlMap({
      target: this.distribuidoresMap.nativeElement,
      layers: [
        OpenLayersService.mapTileSatelite(16),
        OpenLayersService.mapReferenciasPoliticas(),
        this.distribuidoresLayer,
      ],
      view: new View({
        center: fromLonLat([-63.6, -34.6]),
        zoom: 4,
        minZoom: 3,
        maxZoom: 16,
      }),
    });

    this.map.on('singleclick', (event) => {
      const feature = this.map?.forEachFeatureAtPixel(event.pixel, (featureAtPixel) => featureAtPixel as Feature);
      const resumen = feature?.get('resumen') as IResumenDistribuidor | undefined;
      if (resumen) {
        this.seleccionarDistribuidor(resumen);
      }
    });

    setTimeout(() => {
      this.map?.updateSize();
      this.redibujarDistribuidores();
    }, 0);
  }

  private async listarSiembras(): Promise<void> {
    const populate = [
      {
        path: 'semilla',
        select: 'cultivo tipoCultivo',
      },
      {
        path: 'lote',
        select:
          'ubicacion idDistribuidor idProductor huellaHidrica.total huellaHidrica.verde.litrosKg huellaHidrica.azul.litrosKg huellaHidrica.gris.litrosKg',
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
      this.siembras = data.datos;
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
      this.productores = data.datos;
      this.recomputarResumen();
    });
    await this.listadosService.getLastValue('productors', query);
  }

  private async listarDistribuidores(): Promise<void> {
    const query: IQueryParam = {
      select: 'nombre logo direccion geojson idQuimica',
      sort: 'nombre',
      limit: 0,
    };

    this.distribuidores$?.unsubscribe();
    this.distribuidores$ = this.listadosService
      .subscribe<IListado<IDistribuidor>>('distribuidors', query)
      .subscribe((data) => {
        this.distribuidores = data.datos;
        this.recomputarResumen();
      });
    await this.listadosService.getLastValue('distribuidors', query);
  }

  private async listarLotes(): Promise<void> {
    const query: IQueryParam = {
      select:
        'nombre idDistribuidor idProductor idEstablecimiento ubicacion.geojson ubicacion.centro ubicacion.superficie calidadClima.fecha calidadClima.nivel idSondaSuelo serialCamara idsDispositivo huellaHidrica.total huellaHidrica.verde.litrosKg huellaHidrica.azul.litrosKg huellaHidrica.gris.litrosKg',
      limit: 0,
    };

    this.lotes$?.unsubscribe();
    this.lotes$ = this.listadosService.subscribe<IListado<ILote>>('lotes', query).subscribe((data) => {
      this.lotes = data.datos;
      this.recomputarResumen();
    });
    await this.listadosService.getLastValue('lotes', query);
  }

  private async listarEstablecimientos(): Promise<void> {
    const query: IQueryParam = {
      select: 'nombre idDistribuidor idQuimica ubicacion.superficie',
      limit: 0,
    };

    this.establecimientos$?.unsubscribe();
    this.establecimientos$ = this.listadosService
      .subscribe<IListado<IEstablecimiento>>('establecimientos', query)
      .subscribe((data) => {
        this.establecimientos = data.datos;
      });
    await this.listadosService.getLastValue('establecimientos', query);
  }

  private async cargaInicial(): Promise<void> {
    await Promise.all([
      this.listarDistribuidores(),
      this.listarProductores(),
      this.listarLotes(),
      this.listarSiembras(),
      this.listarEstablecimientos(),
    ]);
    this.recomputarResumen();
  }

  private async actualizarNombreCompania(): Promise<void> {
    const permiso = this.helper.permiso;
    const permisoToken = this.helper.user?.permisos?.find(
      (item) => item.idQuimica && item.idQuimica === permiso?.idQuimica && item.quimica?.nombre
    );
    const nombreLocal = permiso?.quimica?.nombre || permisoToken?.quimica?.nombre;

    if (nombreLocal) {
      this.nombreCompania = nombreLocal;
      this.logoCompania = permiso?.quimica?.logo || permisoToken?.quimica?.logo || '';
      return;
    }

    if (!permiso?.idQuimica) {
      return;
    }

    try {
      const quimica = await this.quimicaService.listarPorId(permiso.idQuimica);
      this.nombreCompania = quimica?.nombre || this.nombreCompania;
      this.logoCompania = quimica?.logo || '';
    } catch (error) {
      console.warn('No se pudo resolver el nombre de la compania', error);
    }
  }

  async ngOnInit(): Promise<void> {
    await this.actualizarNombreCompania();
    this.loading = true;
    this.activatedRoute.queryParams.subscribe(async () => {
      await this.cargaInicial();
      this.loading = false;
      this.cdr.detectChanges();
      setTimeout(() => this.map?.updateSize(), 0);
    });
  }

  ngAfterViewInit(): void {
    this.inicializarMapa();
  }

  ngOnDestroy(): void {
    this.siembras$?.unsubscribe();
    this.productores$?.unsubscribe();
    this.distribuidores$?.unsubscribe();
    this.lotes$?.unsubscribe();
    this.establecimientos$?.unsubscribe();
    this.map?.setTarget(undefined);
  }
}
