import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { ICreateLicencia, ILicencia } from 'modelos/src';
import { LicenciaService } from '../../../../auxiliares/http/licencia.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';
import { ListadosService } from '../../../../auxiliares/servicios/listados';

@Component({
  selector: 'app-crear-editar-licencias',
  imports: [SharedModule],
  templateUrl: './crear-editar-licencias.component.html',
  styleUrl: './crear-editar-licencias.component.scss',
})
export class CrearEditarLicenciasComponent implements OnInit {
  public loading = false;
  public licencia?: ILicencia;
  public titulo?: () => string;
  public form?: FormGroup;
  public estadosPlan = [
    { label: 'Borrador', value: 'borrador' },
    { label: 'Activo', value: 'activo' },
    { label: 'Archivado', value: 'archivado' },
  ];
  public modelosFacturacion = [
    { label: 'Sin cargo', value: 'sin_cargo' },
    { label: 'Suscripcion', value: 'suscripcion' },
    { label: 'Por uso', value: 'por_uso' },
    { label: 'Hibrido', value: 'hibrido' },
  ];
  public modosLimite = [
    { label: 'Informativo (no bloquea)', value: 'informativo' },
    { label: 'Bloqueante', value: 'bloqueante' },
  ];

  get modulos() {
    return this.form?.get('modulos') as FormGroup;
  }

  constructor(
    private paramsService: ParamsService,
    private translate: TranslateService,
    private service: LicenciaService,
    private helper: HelperService,
    private listado: ListadosService
  ) {}

  private createForm(): void {
    this.form = new FormGroup({
      nombre: new FormControl(this.licencia?.nombre || 'Licencia manual', Validators.required),
      codigo: new FormControl(this.licencia?.codigo),
      version: new FormControl(this.licencia?.version ?? 1, [Validators.required, Validators.min(1)]),
      estado: new FormControl(this.licencia?.estado || 'activo', Validators.required),
      modeloFacturacion: new FormControl(this.licencia?.modeloFacturacion || 'sin_cargo', Validators.required),
      modoLimite: new FormControl(this.licencia?.modoLimite || 'informativo', Validators.required),
      maxUsuarios: new FormControl(this.licencia?.maxUsuarios ?? 2, Validators.required),
      maxdDistribuidores: new FormControl(this.licencia?.maxdDistribuidores ?? 1, Validators.required),
      maxProductores: new FormControl(this.licencia?.maxProductores ?? 1, Validators.required),
      maxEstablecimientos: new FormControl(this.licencia?.maxEstablecimientos ?? 1, Validators.required),
      maxLotes: new FormControl(this.licencia?.maxLotes ?? 1, Validators.required),
      maxdHectareas: new FormControl(this.licencia?.maxdHectareas ?? 10000, Validators.required),
      modulos: new FormGroup({
        Enfermedades: new FormControl(this.licencia?.modulos?.Enfermedades ?? true, Validators.required),
        Riego: new FormControl(this.licencia?.modulos?.Riego ?? false, Validators.required),
        'Huella Hídrica': new FormControl(this.licencia?.modulos?.['Huella Hídrica'] ?? false, Validators.required),
        NDVI: new FormControl(this.licencia?.modulos?.NDVI ?? true, Validators.required),
        Clima: new FormControl(this.licencia?.modulos?.Clima ?? true, Validators.required),
        'Etapas Fenológicas': new FormControl(
          this.licencia?.modulos?.['Etapas Fenológicas'] ?? true,
          Validators.required
        ),
      }),
    });
  }

  // ACCIONES

  private getData() {
    const data: ICreateLicencia = this.form?.value;
    return data;
  }

  public async guardar(): Promise<void> {
    this.loading = true;
    try {
      const data = this.getData();
      if (this.licencia?._id) {
        await this.service.update(this.licencia._id, data);

        // Solo actualiza el item en cache
        this.listado.patchEntityItem('licencias', {
          _id: this.licencia._id,
          ...data,
        });

        this.helper.notifSuccess(this.translate.instant('Editado correctamente'));
      } else {
        const created = await this.service.create(data);

        // Solo actualiza el item en cache
        this.listado.createEntityItem('licencias', created);

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

  async ngOnInit(): Promise<void> {
    this.loading = true;
    this.licencia = this.paramsService.get('editLicencia');
    if (this.licencia) {
      console.log('edit', this.licencia);
    }
    this.titulo = this.licencia
      ? () => this.translate.instant(`Editar licencia`)
      : () => this.translate.instant(`Crear licencia manual`);
    this.createForm();
    this.loading = false;
  }
}
