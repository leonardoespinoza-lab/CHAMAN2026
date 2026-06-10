import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { ICreateLote, IListado, ILote, IQueryParam } from 'modelos/src';
import { Subscription } from 'rxjs';
import { LoteService } from '../../../../auxiliares/http/lote.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';

@Component({
  selector: 'app-asignar-camara-lote',
  imports: [SharedModule],
  templateUrl: './asignar-camara-lote.component.html',
  styleUrl: './asignar-camara-lote.component.scss',
})
export class AsignarCamaraLoteComponent implements OnInit, OnDestroy {
  @Output() cerrar = new EventEmitter<void>();
  @Input() editarLote?: ILote | null;

  public loading = false;
  public lote?: ILote | null;
  public titulo?: () => string;
  public form?: FormGroup;
  public tabValue = 0;
  public idLote = '';
  public editar = true;

  public lotes$?: Subscription;
  public lotes: ILote[] = [];
  public hoy = new Date();
  public fechaDeExpiracion = new Date(this.hoy.getFullYear(), this.hoy.getMonth() + 1, this.hoy.getDate());

  constructor(
    private paramsService: ParamsService,
    private translate: TranslateService,
    private service: LoteService,
    public helper: HelperService,
    private listados: ListadosService
  ) {}

  private createForm(): void {
    this.form = new FormGroup({
      serialCamara: new FormControl(this.lote?.nombre, Validators.required),
    });
  }

  // ACCIONES

  private getData() {
    const data: ICreateLote = this.form?.value;
    return data;
  }

  private async listar(): Promise<void> {
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
    };

    this.lotes$?.unsubscribe();
    this.lotes$ = this.listados.subscribe<IListado<ILote>>('lotes', queryParams).subscribe(async (data) => {
      this.lotes = data.datos;
      console.log(`listado de lotes`, data);
    });
    await this.listados.getLastValue('lotes', queryParams);
  }

  public async guardar(): Promise<void> {
    this.loading = true;
    try {
      const data = this.getData();
      if (this.idLote) {
        await this.service.editar(this.idLote, data);
        // console.log('edit', data);
        this.helper.notifSuccess(this.translate.instant('Cámara asignada correctamente'));
      }
      this.volver();
    } catch (err) {
      console.error(err);
      this.helper.notifError(err);
    }
    this.loading = false;
  }

  public volver() {
    this.lote = undefined;
    this.editar = false;
    this.idLote = '';
    this.form?.reset();
    this.cerrar.emit();
  }

  public onLoteSelected(event: any) {
    const loteSeleccionado = this.lotes.find((l) => l._id === event.value);
    this.form?.patchValue({ serialCamara: loteSeleccionado?.serialCamara });
  }

  public onDialogShow() {
    this.lote = this.editarLote;
    console.log('Lote recibido en onDialogShow:', this.lote);
    this.editar = this.lote ? true : false;
    if (this.lote) {
      this.idLote = this.lote?._id || '';
      console.log('Lote recibido:', this.lote);
      this.form?.patchValue({ serialCamara: this.lote.serialCamara });
      this.paramsService.set('editLote', '');
    }
  }

  // Hooks
  async ngOnInit(): Promise<void> {
    this.loading = true;
    this.lote = this.paramsService.get('editLote');
    await Promise.all([this.listar()]);
    console.log('Params recibidos');
    this.createForm();
    this.loading = false;
  }

  ngOnDestroy(): void {
    this.lotes$?.unsubscribe();
  }
}
