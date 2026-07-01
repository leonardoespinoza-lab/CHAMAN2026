import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { IListado, IQueryParam, IQuimica } from 'modelos/src';
import { ConfirmationService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { QuimicaService } from '../../../../auxiliares/http/quimica.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';

@Component({
  selector: 'app-listado-quimicas',
  imports: [SharedModule],
  templateUrl: './listado-quimicas.component.html',
  styleUrl: './listado-quimicas.component.scss',
})
export class ListadoQuimicasComponent implements OnInit, OnDestroy {
  public loading = false;

  public name = ListadoQuimicasComponent.name;
  public datos: IQuimica[] = [];
  public totalCount = 0;

  public datos$?: Subscription;

  get user() {
    return this.helper.user;
  }

  constructor(
    public helper: HelperService,
    private listado: ListadosService,
    private confirmationService: ConfirmationService,
    private translate: TranslateService,
    private service: QuimicaService,
    private params: ParamsService,
    private router: Router
  ) {}

  public async create() {    
    this.params.set('editQuimica', false);
    this.router.navigate(['quimicas', 'crear']);
  }

  public async edit(data: IQuimica) {
    this.params.set('editQuimica', data);
    this.router.navigate(['quimicas', 'editar', data._id]);
  }

  public iniciales(dato: IQuimica): string {
    const nombre = (dato.nombre || dato.razonSocial || 'C').trim();
    return nombre
      .split(/\s+/)
      .slice(0, 2)
      .map((parte) => parte.charAt(0).toUpperCase())
      .join('');
  }

  public cuitTexto(dato: IQuimica): string {
    return dato.cuit || 'CUIT pendiente';
  }

  public contactoTexto(dato: IQuimica): string {
    return dato.email || dato.telefono || dato.web || 'Sin contacto cargado';
  }

  public async delete(dato: IQuimica): Promise<void> {
    this.confirmationService.confirm({
      // target: event.target as EventTarget,
      header: this.translate.instant('Por favor, confirme la acción'),
      message: this.translate.instant('¿Desea eliminar la compañía?'),
      closable: true,
      closeOnEscape: true,
      icon: 'pi pi-exclamation-triangle',
      rejectButtonProps: {
        label: this.translate.instant('Cancelar'),
        severity: 'secondary',
        outlined: true,
      },
      acceptButtonProps: {
        label: this.translate.instant('Aceptar'),
      },
      accept: async () => {
        this.loading = true;
        try {
          await this.service.eliminar(dato._id!);
          
          // Solo elimina el item en cache
          this.listado.deleteEntityItem('quimicas', dato._id!);

          this.helper.notifSuccess(this.translate.instant('Eliminado correctamente'));          
        } catch (error) {
          this.helper.notifError(error);
        }
        this.loading = false;
      },
    });
  }

  // Listados

  private async listar(): Promise<void> {
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
    };

    this.datos$?.unsubscribe();
    this.datos$ = this.listado.subscribe<IListado<IQuimica>>('quimicas', queryParams).subscribe(async (data) => {      
      this.totalCount = data.totalCount;
      this.datos = data.datos;
    });        

    await this.listado.getLastValue('quimicas', queryParams);
  }

  public async ngOnInit() {    
    this.loading = true;
    await Promise.all([this.listar()]);
    this.loading = false;
  }

  ngOnDestroy(): void {
    this.datos$?.unsubscribe();
  }
}
