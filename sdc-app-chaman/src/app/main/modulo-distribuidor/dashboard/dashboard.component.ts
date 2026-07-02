import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IFilter, IListado, ILote, IProductor, IQueryParam, ISiembra } from 'modelos/src';
import { Subscription } from 'rxjs';
import { ListadosService } from '../../../auxiliares/servicios/listados';
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
  nombre: string;
  detalle: string;
  hectareas: number;
  lotes: number;
  porcentaje: number;
}

interface IAlertaSanitaria {
  lote: string;
  cultivo: string;
  enfermedad: string;
  resultado: number;
  hectareas: number;
  nivel: NivelRiesgoSanitario;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  imports: [SharedModule],
})
export class DashboardDistribuidorComponent implements OnInit, OnDestroy {
  public loading = true;

  public siembras: ISiembra[] = [];
  public productores: IProductor[] = [];
  public lotes: ILote[] = [];

  public totalHectareas = 0;
  public totalHectareasSembradas = 0;
  public totalLotes = 0;
  public totalSiembrasActivas = 0;
  public hectareasConAlerta = 0;
  public lotesConAlerta = 0;
  public coberturaPrediccion = 0;
  public estadoSanitario = 'Sin datos';
  public estadoSanitarioClase = 'muted';

  public riesgoCards: IRiesgoCard[] = [];
  public productoresResumen: IResumenRanking[] = [];
  public cultivosResumen: IResumenRanking[] = [];
  public alertasSanitarias: IAlertaSanitaria[] = [];

  public riegosEnfermedadPorHectarea = {
    nada: 0,
    bajo: 0,
    medio: 0,
    alto: 0,
  };

  public siembras$?: Subscription;
  public productores$?: Subscription;
  public lotes$?: Subscription;

  constructor(
    private listadosService: ListadosService,
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
    return item.nombre;
  }

  public trackByAlerta(_: number, item: IAlertaSanitaria): string {
    return `${item.lote}-${item.enfermedad}`;
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

  private agregarResumen(map: Map<string, IResumenRanking>, nombre: string, hectareas: number): void {
    const key = nombre || 'Sin dato';
    const actual = map.get(key) || {
      nombre: key,
      detalle: '',
      hectareas: 0,
      lotes: 0,
      porcentaje: 0,
    };
    actual.hectareas += hectareas;
    actual.lotes += 1;
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
      const riesgo = riesgos.get(nivel)!;

      this.totalHectareas += hectareas;
      riesgo.hectareas += hectareas;
      riesgo.lotes += 1;

      this.agregarResumen(productoresMap, productor?.nombre || 'Sin productor', hectareas);

      if (siembra) {
        this.totalHectareasSembradas += hectareas;
        this.agregarResumen(cultivosMap, this.cultivoSiembra(siembra), hectareas);
      }

      if (nivel === 'medio' || nivel === 'alto') {
        const principal = this.alertaPrincipal(siembra);
        alertas.push({
          lote: lote.nombre || 'Lote sin nombre',
          cultivo: this.cultivoSiembra(siembra),
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

    this.productoresResumen = this.ordenarRanking(productoresMap, this.totalHectareas).slice(0, 8);
    this.cultivosResumen = this.ordenarRanking(cultivosMap, this.totalHectareasSembradas).slice(0, 8);
    this.alertasSanitarias = alertas
      .sort((a, b) => b.resultado - a.resultado || b.hectareas - a.hectareas)
      .slice(0, 6);
  }

  private ordenarRanking(map: Map<string, IResumenRanking>, total: number): IResumenRanking[] {
    return [...map.values()]
      .map((item) => ({
        ...item,
        detalle: `${item.lotes} ${item.lotes === 1 ? 'lote' : 'lotes'}`,
        porcentaje: total ? Math.round((item.hectareas / total) * 100) : 0,
      }))
      .sort((a, b) => b.hectareas - a.hectareas || a.nombre.localeCompare(b.nombre));
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
      select: 'nombre',
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
      select: 'nombre idDistribuidor idProductor ubicacion.superficie',
    };

    this.lotes$?.unsubscribe();
    this.lotes$ = this.listadosService.subscribe<IListado<ILote>>('lotes', query).subscribe((data) => {
      this.lotes = data.datos || [];
      this.recomputarResumen();
    });
    await this.listadosService.getLastValue('lotes', query);
  }

  private async cargaInicial(): Promise<void> {
    await Promise.all([this.listarSiembras(), this.listarProductores(), this.listarLotes()]);
    this.recomputarResumen();
  }

  async ngOnInit(): Promise<void> {
    this.loading = true;
    this.activatedRoute.queryParams.subscribe(async () => {
      await this.cargaInicial();
      this.loading = false;
    });
  }

  ngOnDestroy(): void {
    this.siembras$?.unsubscribe();
    this.productores$?.unsubscribe();
    this.lotes$?.unsubscribe();
  }
}
