import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { getLineasFumigacion, IFilter, IFumigacion, IListado, IPopulate, IQueryParam } from 'modelos/src';
import { Subscription } from 'rxjs';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { ILoteTabla } from '../../listado-lotes/listado-lotes.component';
import { IDetalleSiembra } from '../detalles-lote.component';
import { DrawerListadoFumigacionesComponent } from '../drawer-listado-fumigaciones/drawer-listado-fumigaciones.component';

export interface IUltimaFumigacion {
  fechaFumigacion?: string;
  duracion?: number;
  principiosActivos?: {
    nombre?: string;
    concentracion?: number;
    dosis?: number;
    koc?: number;
    persistencia?: number;
  }[];
}

@Component({
  selector: 'app-card-ultima-fumigacion',
  imports: [CommonModule, SharedModule, DrawerListadoFumigacionesComponent],
  templateUrl: './card-ultima-fumigacion.component.html',
  styleUrl: './card-ultima-fumigacion.component.scss',
})
export class CardUltimaFumigacionComponent implements OnInit, OnDestroy, OnChanges {
  // Datos para mostrar
  @Input() public lote?: ILoteTabla;
  @Input() public siembra?: IDetalleSiembra;
  public ultimaFumigacion?: IUltimaFumigacion;
  public verDrawerFumigaciones: boolean = false;

  private fumigaciones$?: Subscription;

  constructor(
    public helper: HelperService,
    public listado: ListadosService,
    private params: ParamsService,
    private router: Router
  ) {}

  private setUltimaFumigacion(): void {
    const fumigaciones = this.siembra?.fumigaciones || [];
    if (!fumigaciones.length) {
      this.ultimaFumigacion = undefined;
      return;
    }

    const ultimasFumigaciones = fumigaciones.filter(
      (fumigacion) => fumigacion.fechaFumigacion === fumigaciones[0].fechaFumigacion
    );
    const principiosActivos: {
      nombre?: string;
      concentracion?: number;
      dosis?: number;
      koc?: number;
      persistencia?: number;
    }[] = [];
    ultimasFumigaciones.forEach((fumigacion) => {
      getLineasFumigacion(fumigacion).forEach((linea) => {
        const principio = linea.principioActivo || fumigacion.principioActivo;
        principiosActivos.push({
          nombre: linea.agroquimico?.nombre || principio?.nombre,
          concentracion: linea.concentracion,
          dosis: linea.dosisLtHa,
          koc: principio?.koc,
          persistencia: principio?.persistencia,
        });
      });
    });

    this.ultimaFumigacion = {
      fechaFumigacion: ultimasFumigaciones[0]?.fechaFumigacion,
      duracion: Math.max(
        ...ultimasFumigaciones.flatMap((fumigacion) =>
          getLineasFumigacion(fumigacion).map((linea) => Number(linea.duracion || 0)),
        ),
      ),
      principiosActivos,
    };
  }

  public get totalFumigaciones(): number {
    return this.siembra?.fumigaciones?.length || 0;
  }

  public get resumenFumigacion(): string {
    if (!this.siembra) return 'Sin siembra activa';
    if (!this.ultimaFumigacion) return 'Sin aplicaciones cargadas';
    return `${this.totalFumigaciones} aplicacion${this.totalFumigaciones === 1 ? '' : 'es'} registrada${
      this.totalFumigaciones === 1 ? '' : 's'
    }`;
  }

  private async listarFumigaciones(): Promise<void> {
    if (this.siembra) {
      const populate: IPopulate = {
        path: 'principioActivo',
        select: 'nombre koc persistencia',
      };
      const filter: IFilter<IFumigacion> = {
        idSiembra: this.siembra._id,
      };
      const query: IQueryParam = {
        filter: JSON.stringify(filter),
        populate: JSON.stringify(populate),
        sort: '-fechaFumigacion',
        limit: 0,
      };
      //
      this.fumigaciones$?.unsubscribe();
      this.fumigaciones$ = this.listado.subscribe<IListado<IFumigacion>>('fumigacions', query).subscribe((data) => {
        this.siembra!.fumigaciones = data?.datos || [];
        this.setUltimaFumigacion();
      });
      await this.listado.getLastValue('fumigacions', query);
    }
  }

  public async fumigar(): Promise<void> {
    this.params.set('fumigarLote', this.lote);
    this.params.set('editFumigacion', false);
    this.params.set('retornoManejoLoteId', this.lote?._id);
    this.router.navigate(['lotes', 'fumigar', this.lote?._id]);
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.listarFumigaciones()]);
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['siembra'] && !changes['siembra'].firstChange) {
      await this.listarFumigaciones();
    }
  }

  ngOnDestroy(): void {
    this.fumigaciones$?.unsubscribe();
  }
}
