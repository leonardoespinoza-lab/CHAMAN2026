import { Component, OnDestroy, OnInit } from '@angular/core';
import { EstadoAlerta, IAlerta, IListado } from 'modelos/src';
import { TableLazyLoadEvent } from 'primeng/table';
import { Subscription } from 'rxjs';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { SharedModule } from '../../../../auxiliares/shared.module';

@Component({
  selector: 'app-listado-alertas',
  imports: [SharedModule],
  templateUrl: './listado-alertas.component.html',
  styleUrl: './listado-alertas.component.scss',
})
export class ListadoAlertasComponent implements OnInit, OnDestroy {
  public name = ListadoAlertasComponent.name;
  public data: IAlerta[] = [];
  public totalCount: number = 0;
  public loading: boolean = false;

  public estados: EstadoAlerta[] = ['Nueva', 'Tratada', 'Postergada', 'Finalizada'];
  public estadosSeleccionados: EstadoAlerta[] = [];

  private alertas$?: Subscription;

  constructor(
    private listado: ListadosService,
    public helper: HelperService
  ) {}

  public async loadData(event: TableLazyLoadEvent): Promise<void> {
    this.loading = true;
    const query = this.helper.buildMongoQuery(event, ['estadoActual']);
    const populate = [
      {
        path: 'siembra',
        populate: {
          path: 'lote',
        },
      },
    ];
    query.populate = JSON.stringify(populate);

    this.alertas$?.unsubscribe();
    this.alertas$ = this.listado.subscribe<IListado<IAlerta>>('alertas', query).subscribe((data) => {
      this.data = data.datos;
      this.totalCount = data.totalCount;
      console.log(`listado de alertas`, data);
    });
    await this.listado.getLastValue('alertas', query);
    this.loading = false;
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.alertas$?.unsubscribe();
  }
}
