import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { getLineasFertilizacion, IFertilizacion, IFilter, IListado, IQueryParam } from 'modelos/src';
import { Subscription } from 'rxjs';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetallesLote } from '../detalles-lote.component';
import { DrawerListadoFertilizacionesComponent } from '../drawer-listado-fertilizaciones/drawer-listado-fertilizaciones.component';

export interface IUltimaFertilizacion {
  fechaFertilizacion?: string;
  fertilizantes?: {
    nombre?: string;
    dosis?: number;
    porcentajeN?: number;
    porcentajeP?: number;
  }[];
}

@Component({
  selector: 'app-card-ultima-fertilizacion',
  imports: [CommonModule, SharedModule, DrawerListadoFertilizacionesComponent],
  templateUrl: './card-ultima-fertilizacion.component.html',
  styleUrl: './card-ultima-fertilizacion.component.scss',
})
export class CardUltimaFertilizacionComponent implements OnInit, OnDestroy {
  // Datos para mostrar
  @Input() public lote?: IDetallesLote;
  public ultimaFertilizacion?: IUltimaFertilizacion;
  public verDrawerFertilizaciones: boolean = false;

  private fertilizaciones$?: Subscription;

  constructor(
    public helper: HelperService,
    public listado: ListadosService,
    private params: ParamsService,
    private router: Router
  ) {}

  private setUltimaFertilizacion(): void {
    const fertilizaciones = this.lote?.fertilizaciones || [];
    if (!fertilizaciones.length) {
      this.ultimaFertilizacion = undefined;
      return;
    }

    const ultimasFertilizaciones = fertilizaciones.filter(
      (fertilizacion) => fertilizacion.fechaFertilizacion === fertilizaciones[0].fechaFertilizacion
    );
    const fertilizantes: {
      nombre?: string;
      dosis?: number;
      porcentajeN?: number;
      porcentajeP?: number;
    }[] = [];
    ultimasFertilizaciones.forEach((fertilizacion) => {
      getLineasFertilizacion(fertilizacion).forEach((linea) => {
        fertilizantes.push({
          nombre: linea.fertilizante?.nombre || fertilizacion.fertilizante?.nombre,
          dosis: linea.dosisKgHa,
          porcentajeN: linea.fertilizante?.porcentajeN ?? fertilizacion.fertilizante?.porcentajeN,
          porcentajeP: linea.fertilizante?.porcentajeP ?? fertilizacion.fertilizante?.porcentajeP,
        });
      });
    });

    this.ultimaFertilizacion = {
      fechaFertilizacion: ultimasFertilizaciones[0]?.fechaFertilizacion,
      fertilizantes,
    };
  }

  public get totalFertilizaciones(): number {
    return this.lote?.fertilizaciones?.length || 0;
  }

  public get resumenFertilizacion(): string {
    if (!this.ultimaFertilizacion) {
      return 'Sin aplicaciones cargadas';
    }
    return `${this.totalFertilizaciones} aplicacion${this.totalFertilizaciones === 1 ? '' : 'es'} registrada${
      this.totalFertilizaciones === 1 ? '' : 's'
    }`;
  }

  private async listarFertilizaciones(): Promise<void> {
    if (this.lote) {
      const filter: IFilter<IFertilizacion> = {
        idLote: this.lote._id,
      };
      const populate = {
        path: 'fertilizante',
        select: 'nombre porcentajeN porcentajeP',
      };
      const query: IQueryParam = {
        filter: JSON.stringify(filter),
        populate: JSON.stringify(populate),
        sort: '-fechaFertilizacion',
        limit: 0,
      };
      //
      this.fertilizaciones$?.unsubscribe();
      this.fertilizaciones$ = this.listado
        .subscribe<IListado<IFertilizacion>>('fertilizacions', query)
        .subscribe((data) => {
          this.lote!.fertilizaciones = data?.datos || [];
          this.setUltimaFertilizacion();
        });
      await this.listado.getLastValue('fertilizacions', query);
    }
  }

  public async fertilizar(): Promise<void> {
    this.params.set('fertilizarLote', this.lote);
    this.params.set('editFertilizacion', false);
    this.router.navigate(['lotes', 'fertilizar', this.lote?._id]);
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.listarFertilizaciones()]);
  }

  ngOnDestroy(): void {
    this.fertilizaciones$?.unsubscribe();
  }
}
