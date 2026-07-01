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
    private translate: TranslateService,
    private activatedRoute: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  public seleccionarDistribuidor(resumen?: IResumenDistribuidor): void {
    this.distribuidorSeleccionado = resumen;
    this.distribuidoresLayer.changed();
    this.cdr.detectChanges();
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
      .join(' · ');
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

  private coordenadasDistribuidor(distribuidor: IDistribuidor): [number, number] | null {
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
      const coordinates = this.coordenadasDistribuidor(resumen as IDistribuidor);
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
      layers: [OpenLayersService.mapTileSatelite(12), OpenLayersService.mapReferenciasPoliticas(), this.distribuidoresLayer],
      view: new View({
        center: fromLonLat([-63.6, -34.6]),
        zoom: 4,
        minZoom: 3,
        maxZoom: 18,
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

  async ngOnInit(): Promise<void> {
    this.nombreCompania = this.helper.permiso?.quimica?.nombre || 'Compañía';
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
