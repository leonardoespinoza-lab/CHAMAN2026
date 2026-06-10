import { Component } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { ISiembra, IUpdateSiembra } from 'modelos/src';
import { SiembraService } from '../../../../auxiliares/http/siembra.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';
import { ILoteTabla } from '../listado-lotes/listado-lotes.component';

@Component({
  selector: 'app-crear-editar-cosecha',
  imports: [SharedModule],
  templateUrl: './crear-editar-cosecha.component.html',
  styleUrl: './crear-editar-cosecha.component.scss',
})
export class CrearEditarCosechaComponent {
  public loading = false;
  public lote?: ILoteTabla;
  public siembra?: ISiembra;
  public titulo?: () => string;
  public form?: FormGroup;
  public tabValue = 0;

  constructor(
    private paramsService: ParamsService,
    private translate: TranslateService,
    private service: SiembraService,
    private helper: HelperService
  ) {}

  // FORMULARIO

  private createForm(): void {
    const fecha = this.siembra?.fechaCosecha ? new Date(this.siembra?.fechaCosecha) : new Date();

    this.form = new FormGroup({
      fechaCosecha: new FormControl(fecha, Validators.required),
      rendimientoObtenidoKgHa: new FormControl(this.siembra?.rendimientoObtenidoKgHa),
      humedadCosecha: new FormControl(this.siembra?.humedadCosecha),
    });
  }

  // ACCIONES

  private getData() {
    const data: IUpdateSiembra = this.form?.value;
    return data;
  }

  public async guardar(): Promise<void> {
    this.loading = true;
    try {
      const data = this.getData();
      const idSiembra = this.lote?.idSiembra;
      if (this.siembra) {
        // Editar cosecha
        await this.service.cosechar(idSiembra!, data);
        this.helper.notifSuccess(this.translate.instant('Editado correctamente'));
      } else {
        // Crear cosecha
        await this.service.cosechar(idSiembra!, data);
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

  //

  async ngOnInit(): Promise<void> {
    this.loading = true;
    this.lote = this.paramsService.get('cosecharLote');
    this.siembra = this.paramsService.get('editCosecha');
    console.log('cosecha del lote', this.lote);
    if (this.siembra) {
      console.log('editar cosecha', this.siembra);
    }

    this.titulo = this.siembra
      ? () => this.translate.instant(`Editar cosecha`)
      : () => this.translate.instant('Cosechar');
    this.createForm();
    this.loading = false;
  }
}
