import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { IAgroquimico, ICreateFumigacion, IFumigacion, IListado, IPrincipioActivo, IQueryParam } from 'modelos/src';
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
  public agroquimicos: IAgroquimico[] = [];
  public agroquimicos$?: Subscription;

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
      idAgroquimico: new FormControl(this.fumigacion?.idAgroquimico),
      idPrincipioActivo: new FormControl(this.fumigacion?.idPrincipioActivo, Validators.required),
      concentracion: new FormControl(this.fumigacion?.concentracion, Validators.required),
      dosisLtHa: new FormControl(this.fumigacion?.dosisLtHa, Validators.required),
      duracion: new FormControl(this.fumigacion?.duracion || 15, Validators.required),
    });

    this.form.get('idAgroquimico')?.valueChanges.subscribe((idAgroquimico) => {
      this.autocompletarDesdeAgroquimico(idAgroquimico);
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

  public detalleAgroquimico(agroquimico?: IAgroquimico): string {
    if (!agroquimico) return '';
    const partes = [];
    if (agroquimico.concentracion !== undefined && agroquimico.concentracion !== null) {
      partes.push(`${agroquimico.concentracion}%`);
    }
    if (agroquimico.volatilidad) {
      partes.push(agroquimico.volatilidad);
    }
    return partes.join(' · ');
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

  private async listarAgroquimicos(): Promise<void> {
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
    };

    this.agroquimicos$?.unsubscribe();
    this.agroquimicos$ = this.listado
      .subscribe<IListado<IAgroquimico>>('agroquimicos', queryParams)
      .subscribe(async (data) => {
        this.agroquimicos = data.datos;
      });
    await this.listado.getLastValue('agroquimicos', queryParams);
  }

  private autocompletarDesdeAgroquimico(idAgroquimico?: string): void {
    const agroquimico = this.agroquimicos.find((item) => item._id === idAgroquimico);
    if (!agroquimico || !this.form) return;

    const patch: Partial<ICreateFumigacion> = {};
    if (agroquimico.idPrincipioActivo) {
      patch.idPrincipioActivo = agroquimico.idPrincipioActivo;
    }
    if (agroquimico.concentracion !== undefined && agroquimico.concentracion !== null) {
      patch.concentracion = agroquimico.concentracion;
    }
    this.form.patchValue(patch, { emitEvent: false });
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
    await Promise.all([this.listarAgroquimicos(), this.listarPrincipiosActivos()]);
    this.autocompletarDesdeAgroquimico(this.form?.get('idAgroquimico')?.value);
    this.loading = false;
  }
}
