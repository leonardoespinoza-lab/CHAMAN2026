import { Component, OnInit, OnDestroy  } from '@angular/core';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { Cultivo, ICreateSemilla, IResistencia, ISemilla, IListado, IQueryParam } from 'modelos/src';
import {
  ENFERMEDADES_CANONICAS,
  getEnfermedadCanonica,
} from 'modelos/src';
import { SemillaService } from '../../../../auxiliares/http/semilla.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

const CULTIVOS_DISPONIBLES_APP: Cultivo[] = ['Soja', 'Trigo', 'Maiz', 'Cebada', 'Arveja', 'Papa', 'Vid', 'Peral', 'Pecan', 'Manzano'];

@Component({
  selector: 'app-crear-editar-semillas',
  imports: [SharedModule],
  templateUrl: './crear-editar-semillas.component.html',
  styleUrl: './crear-editar-semillas.component.scss',
})
export class CrearEditarSemillasComponent implements OnInit, OnDestroy {
  public loading = false;
  public semilla?: ISemilla;
  public titulo?: () => string;
  public form?: FormGroup;

  public ciclos = ['LARGO', 'INTERMEDIO-LARGO', 'INTERMEDIO', 'INTERMEDIO-CORTO', 'CORTO', 'TEMPRANO', 'MUY TEMPRANO', 'MEDIA', 'TARDIA', 'GENERAL'];
  public enfermedades = ENFERMEDADES_CANONICAS.map((item) => item.nombre);
  public perfilesResistencia = ['R', 'MR', 'I', 'MS', 'S', 'T', 'MT', 'DESCONOCIDA'];
  public estadosResistencia = ['observada', 'historica', 'inferida', 'desconocida'];
  public confianzasResistencia = ['alta', 'media', 'baja', 'sin_datos'];
  public cultivosDisponibles: Cultivo[] = [];
  private datos$?: Subscription;

  get resistencia(): FormArray {
    return this.form?.get('resistencia') as FormArray;
  }

  constructor(
    private paramsService: ParamsService,
    private translate: TranslateService,
    private service: SemillaService,
    public helper: HelperService,
    private router: Router,
    private listado: ListadosService,
  ) {}

  private crearControlResistencia(resistencia: Partial<IResistencia> = {}): FormGroup {
    return new FormGroup({
      enfermedad: new FormControl(resistencia.enfermedad || '', Validators.required),
      multiplicador: new FormControl(resistencia.multiplicador ?? null, [Validators.required, Validators.min(0.01), Validators.max(1.4)]),
      indiceResistencia: new FormControl(resistencia.indiceResistencia ?? null, [Validators.min(0), Validators.max(1)]),
      perfil: new FormControl(resistencia.perfil || 'DESCONOCIDA'),
      estado: new FormControl(resistencia.estado || 'desconocida', Validators.required),
      confianza: new FormControl(resistencia.confianza || 'sin_datos', Validators.required),
      fuente: new FormControl(resistencia.fuente || ''),
      campaniaFuente: new FormControl(resistencia.campaniaFuente || ''),
      fechaFuente: new FormControl(resistencia.fechaFuente || ''),
      observaciones: new FormControl(resistencia.observaciones || ''),
    });
  }

  private createForm(): void {
    const resistenciaControls = (this.semilla?.resistencia || []).map((r) =>
      this.crearControlResistencia(r)
    );

    this.form = new FormGroup({
      semillero: new FormControl(this.semilla?.semillero || '', Validators.required),
      cultivo: new FormControl(this.semilla?.cultivo || null, Validators.required),
      variedad: new FormControl(this.semilla?.variedad || '', Validators.required),
      ciclo: new FormControl(this.semilla?.ciclo || null, Validators.required),
      campania: new FormControl(this.semilla?.campania || ''),
      tipoCultivo: new FormControl(this.semilla?.tipoCultivo || 'Anual'),
      portainjerto: new FormControl(this.semilla?.portainjerto || ''),
      requerimientoFrio: new FormGroup({
        horasFrio: new FormControl(this.semilla?.requerimientoFrio?.horasFrio || null),
        horasFrioEfectivas: new FormControl(this.semilla?.requerimientoFrio?.horasFrioEfectivas || null),
        porcionesFrio: new FormControl(this.semilla?.requerimientoFrio?.porcionesFrio || null),
        modelo: new FormControl(this.semilla?.requerimientoFrio?.modelo || 'HF + HFE + CP'),
      }),
      fenologiaReferencia: new FormGroup({
        brotacion: new FormControl(this.semilla?.fenologiaReferencia?.brotacion || ''),
        floracion: new FormControl(this.semilla?.fenologiaReferencia?.floracion || ''),
        cosecha: new FormControl(this.semilla?.fenologiaReferencia?.cosecha || ''),
        editable: new FormControl(this.semilla?.fenologiaReferencia?.editable ?? true),
      }),
      observaciones: new FormControl(this.semilla?.observaciones || ''),
      resistencia: new FormArray(resistenciaControls),
    });
  }

  public agregarResistencia(): void {
    this.resistencia.push(this.crearControlResistencia());
  }

  public borrarResistencia(index: number): void {
    this.resistencia.removeAt(index);
  }

  public async guardar(): Promise<void> {
    this.loading = true;
    try {
      const data: ICreateSemilla = {
        semillero: this.form?.value.semillero,
        cultivo: this.form?.value.cultivo,
        variedad: this.form?.value.variedad,
        ciclo: this.form?.value.ciclo,
        campania: this.form?.value.campania || undefined,
        tipoCultivo: this.form?.value.tipoCultivo || undefined,
        portainjerto: this.form?.value.portainjerto || undefined,
        requerimientoFrio: this.form?.value.requerimientoFrio,
        fenologiaReferencia: this.form?.value.fenologiaReferencia,
        observaciones: this.form?.value.observaciones || undefined,
        resistencia: (this.form?.value.resistencia || []).map((item: IResistencia) => {
          const canonica = getEnfermedadCanonica(item.enfermedad);
          return {
            ...item,
            idEnfermedad: canonica?.id,
            enfermedad: canonica?.nombre || item.enfermedad,
          };
        }),
      };
      if (this.semilla?._id) {
        await this.service.editar(this.semilla._id, data);

        // Solo actualiza el item en cache
        this.listado.patchEntityItem('semillas', {
          _id: this.semilla._id,
          ...data,
        });

        this.helper.notifSuccess(this.translate.instant('Editado correctamente'));
      } else {
        const created = await this.service.crear(data);

        // Solo actualiza el item en cache
        this.listado.createEntityItem('semillas', created);

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
    this.router.navigate(['semillas']);
  }

  async ngOnInit(): Promise<void> {   
    this.loading = true;
    this.semilla = this.paramsService.get('editSemilla') || undefined;
    this.titulo = this.semilla
      ? () => this.translate.instant('Editar semilla')
      : () => this.translate.instant('Crear semilla');
    this.createForm();
    await this.listarCultivos();
    this.loading = false;
  }

  // Método para obtener cultivos únicos desde semillas
  private async listarCultivos(): Promise<void> {
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0
    };
    this.datos$?.unsubscribe();
    this.datos$ = this.listado
      .subscribe<IListado<ISemilla>>('semillas', queryParams)
      .subscribe((data) => {
        // Extraer cultivos únicos del listado        
        const unicos = [...new Set(data.datos.map((s) => s.cultivo).filter(Boolean))] as Cultivo[];
        this.cultivosDisponibles = [...new Set([...CULTIVOS_DISPONIBLES_APP, ...unicos])] as Cultivo[];
      });
    await this.listado.getLastValue('semillas', queryParams);
  }

  ngOnDestroy(): void {
    this.datos$?.unsubscribe();
  }

}
