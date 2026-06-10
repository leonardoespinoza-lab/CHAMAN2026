import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import {
  IDistribuidor,
  IEstablecimiento,
  IFilter,
  IListado,
  ILote,
  IProductor,
  IQueryParam,
  ISiembra,
} from 'modelos/src';
import { Subscription } from 'rxjs';
import { ChartComponent } from '../../../auxiliares/componentes/chart/chart.component';
import { HelperService } from '../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../auxiliares/servicios/listados';
import { SharedModule } from '../../../auxiliares/shared.module';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  imports: [SharedModule, ChartComponent],
})
export class DashboardQuimicaComponent implements OnInit, OnDestroy {
  public loading = true;

  public siembras: ISiembra[] = [];
  public distribuidores: IDistribuidor[] = [];
  public productores: IProductor[] = [];
  public lotes: ILote[] = [];
  public establecimientos: IEstablecimiento[] = [];

  public riegosEnfermedadPorHectarea = {
    nada: 0,
    bajo: 0,
    medio: 0,
    alto: 0,
  };

  //
  public chartHasPorDistribuidor?: Highcharts.Options;
  public totalHasPorDistribuidor = 0;
  //
  public chartHasPorProductor?: Highcharts.Options;
  public totalHasPorProductor = 0;
  //
  public chartHasPorCultivo?: Highcharts.Options;
  public totalHasSembradas = 0;
  //

  // Listado Continuo
  public siembras$?: Subscription;
  public productores$?: Subscription;
  public distribuidores$?: Subscription;
  public lotes$?: Subscription;
  public establecimientos$?: Subscription;

  constructor(
    private listadosService: ListadosService,
    private helper: HelperService,
    private translate: TranslateService,
    private activatedRoute: ActivatedRoute
  ) {}

  // Calular riesgo de enfermedades
  private calcularRiesgoEnfermedades() {
    const siembras = this.siembras;
    let hasNada = 0;
    let hasBajo = 0;
    let hasMedio = 0;
    let hasAlto = 0;
    for (const siembra of siembras) {
      if (!siembra.ultimaPrediccion) {
        hasNada += siembra.lote?.ubicacion?.superficie || 0;
        continue;
      }
      const enfermedades = siembra.ultimaPrediccion?.enfermedades || [];
      const has = siembra.lote?.ubicacion?.superficie || 0;
      let maxRiesgo = 0;
      for (const enfermedad of enfermedades) {
        if (enfermedad.resultado > 20) {
          maxRiesgo = Math.max(maxRiesgo, 2);
        } else if (enfermedad.resultado > 15) {
          maxRiesgo = Math.max(maxRiesgo, 1);
        }
      }
      if (maxRiesgo === 0) {
        hasBajo += has;
      } else if (maxRiesgo === 1) {
        hasMedio += has;
      } else if (maxRiesgo === 2) {
        hasAlto += has;
      }
    }

    this.riegosEnfermedadPorHectarea = {
      nada: hasNada,
      bajo: hasBajo,
      medio: hasMedio,
      alto: hasAlto,
    };
  }

  // Graficos

  private graficoTorta(series: Highcharts.SeriesOptionsType[]) {
    const options: Highcharts.Options = {
      chart: {
        type: 'pie',
        backgroundColor: 'transparent',
        style: {
          fontFamily: 'Lato, sans-serif',
        },
      },
      title: {
        text: undefined,
      },
      legend: {
        labelFormat: '<b>{name}</b> ({y} has.)',
        maxHeight: 400,
        width: 100,
        layout: 'vertical',
        align: 'right',
        verticalAlign: 'middle',
        itemStyle: {
          width: 100,
          whiteSpace: 'wrap',
          textOverflow: 'none',
          color: 'var(--p-text-color)',
        },
      },
      tooltip: {
        headerFormat: '<b>{point.name}</b><br/>',
        pointFormat: '{point.name}: {point.y} has.',
      },
      plotOptions: {
        pie: {
          showInLegend: true,
          cursor: 'pointer',
          dataLabels: {
            enabled: false,
          },
        },
      },
      series,
    };
    return options;
  }

  private graficoHasPorDistribuidor() {
    this.totalHasPorDistribuidor = 0;
    const lotes = this.lotes;

    const data: Highcharts.PointOptionsObject[] = [];

    for (const lote of lotes) {
      const nombreDistribuidor =
        this.distribuidores.find((d) => d._id === lote.idDistribuidor)?.nombre || 'Sin Distribuidor';
      const superficie = lote.ubicacion?.superficie || 0;
      this.totalHasPorDistribuidor += superficie;
      const index = data.findIndex((d) => d.name === nombreDistribuidor);
      if (index === -1) {
        data.push({
          name: nombreDistribuidor,
          y: superficie,
        });
      } else {
        data[index].y! += superficie;
      }
    }

    // Truncar valores
    for (const d of data) {
      d.y = Math.trunc(d.y!);
    }

    const series: Highcharts.SeriesOptionsType[] = [
      {
        type: 'pie',
        data,
      },
    ];

    this.chartHasPorDistribuidor = this.graficoTorta(series);
  }

  private graficoHasPorProductor() {
    this.totalHasPorProductor = 0;
    const lotes = this.lotes;

    const data: Highcharts.PointOptionsObject[] = [];

    for (const lote of lotes) {
      const productor = this.productores.find((p) => p._id === lote.idProductor)?.nombre || 'Sin Productor';
      const superficie = lote.ubicacion?.superficie || 0;

      this.totalHasPorProductor += superficie;

      const index = data.findIndex((d) => d.name === productor);
      if (index === -1) {
        data.push({
          name: productor,
          y: superficie,
        });
      } else {
        data[index].y! += superficie;
      }
    }

    // Truncar valores
    for (const d of data) {
      d.y = Math.trunc(d.y!);
    }

    const series: Highcharts.SeriesOptionsType[] = [
      {
        type: 'pie',
        name: this.translate.instant('Has. Por Productor'),
        data,
      },
    ];

    this.chartHasPorProductor = this.graficoTorta(series);
  }

  private graficoHasPorCultivo() {
    this.totalHasSembradas = 0;
    const siembras = this.siembras;

    const data: Highcharts.PointOptionsObject[] = [];

    for (const siembra of siembras) {
      const cultivo = siembra.semilla?.cultivo || 'Sin Determinar';
      const lote = this.lotes.find((l) => l._id === siembra.idLote);

      const superficie = lote?.ubicacion?.superficie || 0;

      this.totalHasSembradas += superficie;

      const index = data.findIndex((d) => d.name === cultivo);
      if (index === -1) {
        data.push({
          name: cultivo,
          y: superficie,
        });
      } else {
        data[index].y! += superficie;
      }
    }

    // Truncar valores
    for (const d of data) {
      d.y = Math.trunc(d.y!);
    }

    const series: Highcharts.SeriesOptionsType[] = [
      {
        type: 'pie',
        name: this.translate.instant('Has. Por Cultivo'),
        data,
      },
    ];

    this.chartHasPorCultivo = this.graficoTorta(series);
  }

  // Listados

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
        select: 'cultivo',
      },
      {
        path: 'lote',
        select: 'ubicacion',
      },
    ];
    const query: IQueryParam = {
      sort: 'fechaSiembra',
      populate: JSON.stringify(populate),
      filter: JSON.stringify(filter),
      select: 'idProductor idDistribuidor idEstablecimiento idLote ultimaPrediccion idSemilla lote',
    };
    //
    this.siembras$?.unsubscribe();
    this.siembras$ = this.listadosService.subscribe<IListado<ISiembra>>('siembras', query).subscribe(async (data) => {
      this.siembras = data.datos;
      this.graficoHasPorCultivo();
    });
    await this.listadosService.getLastValue('siembras', query);
  }

  private async listarProductores(): Promise<void> {
    const query: IQueryParam = {
      select: 'nombre',
    };
    //
    this.productores$?.unsubscribe();
    this.productores$ = this.listadosService
      .subscribe<IListado<IProductor>>('productors', query)
      .subscribe(async (data) => {
        this.productores = data.datos;
      });
    await this.listadosService.getLastValue('productors', query);
  }

  private async listarDistribuidores(): Promise<void> {
    const query: IQueryParam = {
      select: 'nombre',
    };
    //
    this.distribuidores$?.unsubscribe();
    this.distribuidores$ = this.listadosService
      .subscribe<IListado<IDistribuidor>>('distribuidors', query)
      .subscribe(async (data) => {
        this.distribuidores = data.datos;
      });
    await this.listadosService.getLastValue('distribuidors', query);
  }

  private async listarLotes(): Promise<void> {
    const query: IQueryParam = {
      select: 'nombre idDistribuidor idProductor ubicacion.superficie',
    };
    //
    this.lotes$?.unsubscribe();
    this.lotes$ = this.listadosService.subscribe<IListado<ILote>>('lotes', query).subscribe(async (data) => {
      this.lotes = data.datos;
      this.graficoHasPorDistribuidor();
      this.graficoHasPorProductor();
    });
    await this.listadosService.getLastValue('lotes', query);
  }

  private async cargaInicial(): Promise<void> {
    await Promise.all([
      this.listarSiembras(),
      this.listarProductores(),
      this.listarDistribuidores(),
      this.listarLotes(),
    ]);
    this.graficoHasPorDistribuidor();
    this.graficoHasPorProductor();
    this.graficoHasPorCultivo();
    this.calcularRiesgoEnfermedades();
  }

  //

  async ngOnInit(): Promise<void> {
    this.loading = true;
    this.activatedRoute.queryParams.subscribe(async (params) => {
      await this.cargaInicial();
    });
    this.loading = false;
  }

  ngOnDestroy(): void {
    this.siembras$?.unsubscribe();
    this.productores$?.unsubscribe();
    this.distribuidores$?.unsubscribe();
    this.lotes$?.unsubscribe();
  }
}
