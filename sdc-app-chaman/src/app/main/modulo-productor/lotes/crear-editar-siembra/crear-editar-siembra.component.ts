import { Component } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import {
  CULTIVOS_DISPONIBLES,
  CULTIVOS_PERENNES,
  Cultivo,
  getNombreImplantacion,
  ICreateSiembra,
  IListado,
  IQueryParam,
  ISemilla,
  ISiembra,
  TTipoDosisN,
  TTipoDosisP,
  TTipoFijacionN,
  TTipoIntensidadLluvias,
  TTipoLabranza,
  TTipoLluviaPromedio,
  TTipoManejoAgronomico,
  TTipoMateriaOrganica,
  TTipoRendimiento,
} from 'modelos/src';
import { Subscription } from 'rxjs';
import { SiembraService } from '../../../../auxiliares/http/siembra.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';
import { ILoteTabla } from '../listado-lotes/listado-lotes.component';

const CULTIVOS_DISPONIBLES_APP: Cultivo[] = [...CULTIVOS_DISPONIBLES];
const CULTIVOS_PERENNES_APP: Cultivo[] = [...CULTIVOS_PERENNES];

@Component({
  selector: 'app-crear-editar-siembra',
  imports: [SharedModule],
  templateUrl: './crear-editar-siembra.component.html',
  styleUrl: './crear-editar-siembra.component.scss',
})
export class CrearEditarSiembraComponent {
  public loading = false;
  public lote?: ILoteTabla;
  public siembra?: ISiembra;
  public titulo?: () => string;
  public form?: FormGroup;
  public tabValue = 0;

  public todasLasSemillas: ISemilla[] = [];
  public semillas$?: Subscription;
  public cultivosDisponibles: Cultivo[] = [];
  public lluviasPromedio: TTipoLluviaPromedio[] = ['< 600', '> 600 < 1200', '> 1200 < 1800', '> 1800'];
  public fijacionN: TTipoFijacionN[] = ['0', '> 0 < 30', '> 30 < 60', '> 60'];
  public dosisN: TTipoDosisN[] = ['Muy Baja', 'Baja', 'Alta', 'Muy Alta'];
  public dosisP: TTipoDosisP[] = ['Muy Baja', 'Baja', 'Alta', 'Muy Alta'];
  public rendimiento: TTipoRendimiento[] = ['Muy Bajo', 'Bajo', 'Alto', 'Muy Alto'];
  public manejoAgronomico: TTipoManejoAgronomico[] = ['Malo', 'Promedio', 'Bueno', 'Excelente'];
  public intensidadLluvias: TTipoIntensidadLluvias[] = ['Suaves', 'Moderadas', 'Intensas', 'Muy Intensas'];
  public materiaOrganica: TTipoMateriaOrganica[] = ['< 1', '> 1 < 3', '> 3 < 5', '> 5'];
  public labranza: TTipoLabranza[] = ['Siembra Directa', 'Convencional', 'Labranza', 'Reducida'];

  public get cultivoSeleccionado(): Cultivo | undefined {
    return this.form?.get('cultivo')?.value;
  }

  public get esCultivoPerenne(): boolean {
    return !!this.cultivoSeleccionado && CULTIVOS_PERENNES_APP.includes(this.cultivoSeleccionado);
  }

  public get etiquetaFechaSiembra(): string {
    return this.esCultivoPerenne ? 'Inicio de plantacion / campania' : 'Fecha de siembra';
  }

  public get etiquetaMaterial(): string {
    return this.esCultivoPerenne ? 'Variedad / pie' : 'Semilla';
  }

  public get loteTitulo(): string {
    if (!this.lote) {
      return 'Chaman Agro';
    }
    const nombre = (this.lote.nombre || '').trim();
    if (!nombre) {
      return 'Lote sin nombre';
    }
    return /^lote\b/i.test(nombre) ? nombre : `Lote ${nombre}`;
  }

  public get semillaSeleccionada(): ISemilla | undefined {
    const idSemilla = this.form?.get('idSemilla')?.value;
    return this.todasLasSemillas.find((semilla) => semilla._id === idSemilla);
  }

  public get materialSeleccionadoLabel(): string {
    const semilla = this.semillaSeleccionada;
    if (!semilla) return 'Selecciona material vegetal para activar los servicios.';
    const piezas = [semilla.variedad, semilla.portainjerto].filter(Boolean);
    return piezas.join(' / ') || semilla.ciclo || 'Material seleccionado';
  }

  public get materialSeleccionadoSubtitulo(): string {
    const semilla = this.semillaSeleccionada;
    if (!semilla) return 'Para frutales se usa variedad, pie, frio requerido y ventanas fenologicas editables.';
    return [semilla.cultivo, semilla.semillero, semilla.campania].filter(Boolean).join(' - ');
  }

  public get accionImplantacion(): string {
    return getNombreImplantacion(this.cultivoSeleccionado);
  }

  public get ayudaCultivo(): string {
    if (!this.cultivoSeleccionado) return '';
    if (this.esCultivoPerenne) {
      return 'Plantacion perenne: Chaman renueva la campania fenologica cada temporada y activa frio, grados dia y ventana sanitaria.';
    }
    return 'Cultivo anual: Chaman usa fecha de siembra, ciclo y fenologia base para activar servicios del lote.';
  }

  get semillas() {
    const cultivo = this.form?.get('cultivo')?.value;
    if (!cultivo) return [];
    return this.todasLasSemillas.filter(
      (s) => s.cultivo?.toLowerCase() === cultivo.toLowerCase()
    );
  }

  constructor(
    private paramsService: ParamsService,
    private translate: TranslateService,
    private service: SiembraService,
    private helper: HelperService,
    private listado: ListadosService
  ) {}

  // FORMULARIO
  private createForm(): void {
    const fecha = this.siembra?.fechaSiembra ? new Date(this.siembra?.fechaSiembra) : new Date();

    this.form = new FormGroup({
      fechaSiembra: new FormControl(fecha, Validators.required),
      idSemilla: new FormControl(this.siembra?.idSemilla, Validators.required),
      labranza: new FormControl(this.siembra?.labranza),
      lluviasPromedio: new FormControl(this.siembra?.lluviasPromedio),
      intensidadLluvias: new FormControl(this.siembra?.intensidadLluvias),
      fijacionN: new FormControl(this.siembra?.fijacionN),
      dosisP: new FormControl(this.siembra?.dosisP),
      dosisN: new FormControl(this.siembra?.dosisN),
      rendimiento: new FormControl(this.siembra?.rendimiento),
      manejoAgronomico: new FormControl(this.siembra?.manejoAgronomico),
      materiaOrganica: new FormControl(this.siembra?.materiaOrganica),
      cultivo: new FormControl(),
    });

    // Al cambiar cultivo, limpiar semilla seleccionada
    this.form.get('cultivo')?.valueChanges.subscribe(() => {
      this.form?.get('idSemilla')?.setValue(null);
    });

  }

  // ACCIONES

  private getData() {
    const data: ICreateSiembra = this.form?.value;
    data.idLote = this.lote?._id;
    return data;
  }

  public async guardar(): Promise<void> {
    this.loading = true;
    try {
      const data = this.getData();
      if (this.siembra?._id) {
        await this.service.editar(this.siembra._id, data);
        this.helper.notifSuccess(this.translate.instant('Editado correctamente'));
      } else {
        const created = await this.service.crear(data);
       
        const lote = this.paramsService.get('detallesLote');

        if (lote) {
          const nuevoLote = {
            ...lote,
            siembra: created
          };

          this.paramsService.set('detallesLote', nuevoLote);
        }
       
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

  private async listarSemillas(): Promise<void> {
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
    };

    this.semillas$?.unsubscribe();
    this.semillas$ = this.listado.subscribe<IListado<ISemilla>>('semillas', queryParams).subscribe((data) => {
      this.todasLasSemillas = data.datos;

      const unicos = [...new Set(data.datos.map((s: any) => s.cultivo).filter(Boolean))] as Cultivo[];
      this.cultivosDisponibles = [...new Set([...CULTIVOS_DISPONIBLES_APP, ...unicos])] as Cultivo[];

      // Si es edición, preseleccionar cultivo según semilla guardada
      if (this.siembra?.idSemilla && !this.form?.get('cultivo')?.value) {
        const semillaActual = data.datos.find((s) => s._id === this.siembra?.idSemilla);
        if (semillaActual) {
          this.form?.get('cultivo')?.setValue(semillaActual.cultivo, { emitEvent: false });
        }
      }
    });
    await this.listado.getLastValue('semillas', queryParams);
  }

  //

  async ngOnInit(): Promise<void> {
    this.loading = true;
    this.lote = this.paramsService.get('sembrarLote');
    this.siembra = this.paramsService.get('editSiembra');
    console.log('siembra del lote', this.lote);
    if (this.siembra) {
      console.log('editar siembra', this.siembra);
    }

    this.titulo = this.siembra
      ? () => this.translate.instant(this.esCultivoPerenne ? 'Editar plantacion' : 'Editar siembra')
      : () => this.translate.instant(this.esCultivoPerenne ? 'Crear plantacion' : 'Sembrar');
    this.createForm();
    await Promise.all([this.listarSemillas()]);
    this.loading = false;
  }

}
