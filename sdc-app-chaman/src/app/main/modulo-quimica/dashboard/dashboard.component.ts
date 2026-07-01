import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import {
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
    private cdr: ChangeDetectorRef
  ) {}

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
    const nombreArchivo = `informe-${this.nombreCompania || 'compania'}-${fecha.toISOString().slice(0, 10)}`
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
          .eyebrow { color: #0f766e; font-size: 10px; font-weight: 700; letter-spacing: 0; text-transform: uppercase; }
          .title-row { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; }
          h1 { margin-top: 8px; font-size: 30px; line-height: 1.05; }
          .subtitle { margin-top: 8px; color: #48627f; font-size: 13px; line-height: 1.4; }
          .date { border: 1px solid #c8d7e7; border-radius: 8px; padding: 10px 12px; min-width: 132px; text-align: right; }
          .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
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
          .bar { width: 100%; height: 8px; border-radius: 999px; background: #e4edf6; overflow: hidden; }
          .bar span { display: block; height: 100%; background: #2dd4bf; }
          .status { display: inline-block; width: 9px; height: 9px; border-radius: 999px; margin-right: 7px; }
          .status.muted { background: #94a3b8; }
          .status.ok { background: #65a30d; }
          .status.warn { background: #f59e0b; }
          .status.danger { background: #dc2626; }
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
            <div class="title-row">
              <div>
                <span class="eyebrow">Informe ejecutivo Chaman</span>
                <h1>${this.escapeHtml(this.nombreCompania)}</h1>
                <p class="subtitle">Resumen corporativo de red comercial, productores, lotes, hectareas monitoreadas, cultivos y sanidad.</p>
              </div>
              <div class="date">
                <span class="eyebrow">Fecha</span>
                <strong>${fechaTexto}</strong>
              </div>
            </div>
          </section>

          <section class="metrics">
            <article class="metric"><span>Distribuidores</span><strong>${this.formatNumber(this.totalDistribuidores)}</strong></article>
            <article class="metric"><span>Productores</span><strong>${this.formatNumber(this.totalProductores)}</strong></article>
            <article class="metric"><span>Lotes</span><strong>${this.formatNumber(this.totalLotes)}</strong></article>
            <article class="metric warn"><span>Hectareas con alerta</span><strong>${this.formatHa(this.hectareasConAlerta)}</strong></article>
            <article class="metric"><span>Hectareas monitoreadas</span><strong>${this.formatHa(this.totalHectareas)}</strong></article>
            <article class="metric"><span>Cultivos activos</span><strong>${this.formatNumber(this.cultivosActivos)}</strong></article>
            <article class="metric"><span>Distribuidores geolocalizados</span><strong>${this.formatNumber(this.distribuidoresConUbicacion)}</strong></article>
            <article class="metric"><span>Sin actividad vinculada</span><strong>${this.formatNumber(distribuidoresSinActividad)}</strong></article>
          </section>

          <section class="grid">
            <div class="section">
              <h2>Hectareas por cultivo</h2>
              <table>
                <thead><tr><th>Cultivo</th><th>Lotes</th><th>Hectareas</th><th>Participacion</th></tr></thead>
                <tbody>${rowsCultivos || '<tr><td colspan="4">Sin cultivos asociados.</td></tr>'}</tbody>
              </table>
            </div>
            <div class="section">
              <h2>Riesgo sanitario</h2>
              <table>
                <thead><tr><th>Categoria</th><th>Hectareas</th><th>%</th></tr></thead>
                <tbody>${rowsSanidad}</tbody>
              </table>
            </div>
          </section>

          <section class="section">
            <h2>Distribuidores con actividad monitoreada</h2>
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Distribuidor</th><th>Productores</th><th>Lotes</th><th>Hectareas</th><th>Alerta</th><th>Cultivos principales</th>
                </tr>
              </thead>
              <tbody>${rowsDistribuidores || '<tr><td colspan="7">Todavia no hay productores o lotes asociados a estos distribuidores.</td></tr>'}</tbody>
            </table>
          </section>

          <section class="section">
            <div class="note">
              El informe se calcula con el alcance visible para la compañia activa. Los valores sanitarios resumen la ultima prediccion disponible por lote y se expresan como hectareas bajo cada categoria.
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
    const ordenadas = [...this.siembras].sort((a, b) => {
      const fechaA = new Date(a.fechaSiembra || '').getTime() || 0;
      const fechaB = new Date(b.fechaSiembra || '').getTime() || 0;
      return fechaB - fechaA;
    });

    ordenadas.forEach((siembra) => {
      if (siembra.idLote && !map.has(siembra.idLote)) {
        map.set(siembra.idLote, siembra);
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

    const enfermedades = siembra.ultimaPrediccion.enfermedades || [];
    const maximo = enfermedades.reduce((max, enfermedad) => Math.max(max, enfermedad.resultado || 0), 0);

    if (maximo > 20) {
      return 'alto';
    }
    if (maximo > 15) {
      return 'medio';
    }
    return 'bajo';
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
      this.agregarCultivo(cultivosGlobal, cultivo, hectareas);

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

      if (!cultivosPorDistribuidor.has(resumen.id)) {
        cultivosPorDistribuidor.set(resumen.id, new Map<string, IResumenCultivo>());
      }
      this.agregarCultivo(cultivosPorDistribuidor.get(resumen.id)!, cultivo, hectareas);
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
      layers: [OpenLayersService.mapTileSatelite(16), OpenLayersService.mapReferenciasPoliticas(), this.distribuidoresLayer],
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
        select: 'cultivo',
      },
      {
        path: 'lote',
        select: 'ubicacion idDistribuidor idProductor',
      },
    ];
    const query: IQueryParam = {
      sort: '-fechaSiembra',
      populate: JSON.stringify(populate),
      select: 'fechaSiembra idProductor idDistribuidor idEstablecimiento idLote ultimaPrediccion idSemilla lote',
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
      select: 'nombre direccion geojson idQuimica',
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
      select: 'nombre idDistribuidor idProductor idEstablecimiento ubicacion.superficie',
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
