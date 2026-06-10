import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { ICreateFumigacion, IFumigacion, IListado, IPrincipioActivo, IQueryParam } from 'modelos/src';
import { Subscription } from 'rxjs';
import { FumigacionService } from '../../../../auxiliares/http/fumigacion.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';
import { ILoteTabla } from '../listado-lotes/listado-lotes.component';

@Component({
  selector: 'app-crear-editar-fumigacion',
  imports: [SharedModule],
  templateUrl: './crear-editar-fumigacion.component.html',
  styleUrl: './crear-editar-fumigacion.component.scss',
})
export class CrearEditarFumigacionComponent implements OnInit {
  public loading = false;
  public lote?: ILoteTabla;
  public fumigacion?: IFumigacion;
  public titulo?: () => string;
  public form?: FormGroup;
  public tabValue = 0;

  public principiosActivos: IPrincipioActivo[] = [];
  public principiosActivos$?: Subscription;

  constructor(
    private paramsService: ParamsService,
    private translate: TranslateService,
    private service: FumigacionService,
    private helper: HelperService,
    private listado: ListadosService
  ) {}

  // FORMULARIO
  private createForm(): void {
    const fecha = this.fumigacion?.fechaFumigacion ? new Date(this.fumigacion?.fechaFumigacion) : new Date();

    this.form = new FormGroup({
      fechaFumigacion: new FormControl(fecha, Validators.required),
      idPrincipioActivo: new FormControl(this.fumigacion?.idPrincipioActivo, Validators.required),
      concentracion: new FormControl(this.fumigacion?.concentracion, Validators.required),
      dosisLtHa: new FormControl(this.fumigacion?.dosisLtHa, Validators.required),
      duracion: new FormControl(this.fumigacion?.duracion || 15, Validators.required),
    });
  }

  // ACCIONES

  private getData() {
    const data: ICreateFumigacion = this.form?.value;
    data.idSiembra = this.fumigacion?.idSiembra || this.lote?.siembra?._id;
    return data;
  }

  public async guardar(): Promise<void> {
    this.loading = true;
    try {
      const data = this.getData();
      if (this.fumigacion?._id) {
        await this.service.editar(this.fumigacion._id, data);
        this.helper.notifSuccess(this.translate.instant('Editado correctamente'));
      } else {
        await this.service.crear(data);
        this.helper.notifSuccess(this.translate.instant('Creado correctamente'));
      }
      this.volver();
    } catch (err) {
      console.error(err);
      this.helper.notifError(err);
    }
    this.loading = false;
  }

  public volver() {
    window.history.back();
  }

  // LISTADOS

  private async listarPrincipiosActivos(): Promise<void> {
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
    };

    this.principiosActivos$?.unsubscribe();
    this.principiosActivos$ = this.listado
      .subscribe<IListado<IPrincipioActivo>>('principioActivos', queryParams)
      .subscribe(async (data) => {
        this.principiosActivos = data.datos;
      });
    await this.listado.getLastValue('principioActivos', queryParams);
  }

  //

  async ngOnInit(): Promise<void> {
    this.loading = true;
    this.lote = this.paramsService.get('fumigarLote');
    this.fumigacion = this.paramsService.get('editFumigacion');

    this.titulo = this.fumigacion
      ? () => this.translate.instant(`Editar fumigación`)
      : () => this.translate.instant('Fumigar');
    this.createForm();
    await Promise.all([this.listarPrincipiosActivos()]);
    this.loading = false;
  }
}
