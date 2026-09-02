import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import {
  getLineasFertilizacion,
  ICreateFertilizacion,
  IFertilizacion,
  IFertilizante,
  ILineaFertilizacion,
  IListado,
  IQueryParam,
} from 'modelos/src';
import { Subscription } from 'rxjs';
import { FertilizacionService } from '../../../../auxiliares/http/fertilizacion.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';
import { ILoteTabla } from '../listado-lotes/listado-lotes.component';

@Component({
  selector: 'app-crear-editar-fertilizacion',
  imports: [SharedModule],
  templateUrl: './crear-editar-fertilizacion.component.html',
  styleUrl: './crear-editar-fertilizacion.component.scss',
})
export class CrearEditarFertilizacionComponent {
  public loading = false;
  public lote?: ILoteTabla;
  public fertilizacion?: IFertilizacion;
  public titulo?: () => string;
  public form?: FormGroup;
  public tabValue = 0;

  public fertilizantes: IFertilizante[] = [];
  public fertilizantes$?: Subscription;

  constructor(
    private paramsService: ParamsService,
    private translate: TranslateService,
    private service: FertilizacionService,
    private helper: HelperService,
    private listado: ListadosService,
    private router: Router
  ) {}

  // FORMULARIO
  private createForm(): void {
    const fecha = this.fertilizacion?.fechaFertilizacion
      ? new Date(this.fertilizacion?.fechaFertilizacion)
      : new Date();

    const lineas = getLineasFertilizacion(this.fertilizacion);
    this.form = new FormGroup({
      fechaFertilizacion: new FormControl(fecha, Validators.required),
      lineas: new FormArray(
        (lineas.length ? lineas : [{}]).map((linea) => this.crearLinea(linea)),
      ),
    });
  }

  private crearLinea(linea: ILineaFertilizacion): FormGroup {
    return new FormGroup({
      idFertilizante: new FormControl(linea.idFertilizante, Validators.required),
      dosisKgHa: new FormControl(linea.dosisKgHa, [Validators.required, Validators.min(0.001)]),
    });
  }

  public get lineas(): FormArray {
    return this.form?.get('lineas') as FormArray;
  }

  public agregarLinea(): void {
    if (this.lineas.length >= 12) return;
    this.lineas.push(this.crearLinea({}));
  }

  public quitarLinea(index: number): void {
    if (this.lineas.length <= 1) return;
    this.lineas.removeAt(index);
  }

  // ACCIONES

  private getData() {
    const data: ICreateFertilizacion = this.form?.getRawValue();
    data.idLote = this.fertilizacion?.idLote || this.lote?._id;
    const primera = data.lineas?.[0];
    data.idFertilizante = primera?.idFertilizante;
    data.dosisKgHa = primera?.dosisKgHa;
    return data;
  }

  public async guardar(): Promise<void> {
    this.loading = true;
    try {
      const data = this.getData();
      if (this.fertilizacion?._id) {
        await this.service.editar(this.fertilizacion._id, data);
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

  public volver(): void {
    const idLote = this.paramsService.get('retornoManejoLoteId') as unknown as string | undefined;
    if (idLote) {
      this.paramsService.remove('retornoManejoLoteId');
      void this.router.navigate(['lotes', 'detalles', idLote], { fragment: 'manejo-cultivo' });
      return;
    }
    window.history.back();
  }

  // LISTADOS

  private async listarFertilizantes(): Promise<void> {
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
    };

    this.fertilizantes$?.unsubscribe();
    this.fertilizantes$ = this.listado
      .subscribe<IListado<IFertilizante>>('fertilizantes', queryParams)
      .subscribe(async (data) => {
        this.fertilizantes = data.datos;
      });
    await this.listado.getLastValue('fertilizantes', queryParams);
  }

  //

  async ngOnInit(): Promise<void> {
    this.loading = true;
    this.lote = this.paramsService.get('fertilizarLote');
    this.fertilizacion = this.paramsService.get('editFertilizacion');

    this.titulo = this.fertilizacion
      ? () => this.translate.instant(`Editar fertilización`)
      : () => this.translate.instant('Nueva fertilización');
    this.createForm();
    await Promise.all([this.listarFertilizantes()]);
    this.loading = false;
  }
}
