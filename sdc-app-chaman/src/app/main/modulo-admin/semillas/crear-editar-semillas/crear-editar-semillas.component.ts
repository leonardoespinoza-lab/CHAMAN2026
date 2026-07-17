import { Component, OnInit, OnDestroy  } from '@angular/core';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import {
  Cultivo,
  esCultivoPerenne,
  getClasificacionTermicaCultivo,
  IClasificacionTermicaCultivo,
  ICreateSemilla,
  IListado,
  IParametrosAgrometeorologicos,
  IQueryParam,
  IResistencia,
  ISemilla,
} from 'modelos/src';
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
  public modelosFrio = ['HF + Dynamic Model', 'HF', 'CP'];
  public modelosRectoresFrio = ['sin_calibrar', 'HF', 'CP'];
  public estadosRequerimientoFrio = ['requiere_calibracion', 'referencia', 'validado'];
  public confianzasRequerimientoFrio = ['estimada', 'media', 'alta'];
  public estadosProtocoloFrio = [
    'requiere_calibracion',
    'referencia',
    'validado',
  ];
  public tiposInicioProtocoloFrio = [
    {
      label: 'Biofix de inicio observado',
      value: 'biofix',
    },
    {
      label: 'Fecha calendario validada',
      value: 'fecha_calendario',
    },
  ];
  public tiposFinProtocoloFrio = [
    {
      label: 'Biofix de cierre observado',
      value: 'biofix',
    },
    {
      label: 'Fecha calendario validada',
      value: 'fecha_calendario',
    },
  ];
  public habitosVernalizacion = [
    'desconocido',
    'primaveral',
    'facultativo',
    'invernal',
  ];
  public modelosVernalizacion = ['ventana_calibrada'];
  public estadosVernalizacion = [
    'requiere_calibracion',
    'referencia',
    'validado',
  ];
  public estadosParametrosTermicos = [
    'requiere_calibracion',
    'referencia',
    'validado',
  ];
  public estadosFotoperiodo = [
    'requiere_calibracion',
    'referencia',
    'validado',
  ];
  public respuestasFotoperiodo = [
    {
      label: 'Dia corto',
      value: 'dia_corto',
    },
    {
      label: 'Dia largo',
      value: 'dia_largo',
    },
    {
      label: 'Neutra',
      value: 'neutra',
    },
  ];
  public opcionesVernalizacionArveja = [
    {
      label: 'No configurada (modelo térmico-fotoperiódico)',
      value: false,
    },
    {
      label: 'Sí, respuesta varietal documentada',
      value: true,
    },
  ];
  public cultivosDisponibles: Cultivo[] = [];
  private datos$?: Subscription;
  private cultivoForm$?: Subscription;
  private cultivoAnterior?: Cultivo | null;

  get resistencia(): FormArray {
    return this.form?.get('resistencia') as FormArray;
  }

  get gddEtapas(): FormArray {
    return this.form?.get('parametrosTermicos.gddEtapas') as FormArray;
  }

  get fotoperiodoEtapas(): FormArray {
    return this.form?.get(
      'parametrosTermicos.fotoperiodo.etapas',
    ) as FormArray;
  }

  get cultivoSeleccionado(): Cultivo | undefined {
    return this.form?.get('cultivo')?.value || this.semilla?.cultivo;
  }

  get esCultivoPerenneSeleccionado(): boolean {
    return esCultivoPerenne(this.cultivoSeleccionado);
  }

  get permiteVernalizacionSeleccionada(): boolean {
    return (
      this.cultivoSeleccionado === 'Trigo' ||
      this.cultivoSeleccionado === 'Cebada' ||
      this.cultivoSeleccionado === 'Arveja'
    );
  }

  get usaVernalizacionSeleccionada(): boolean {
    if (
      this.cultivoSeleccionado === 'Trigo' ||
      this.cultivoSeleccionado === 'Cebada'
    ) {
      return true;
    }
    return (
      this.cultivoSeleccionado === 'Arveja' &&
      this.form?.get('requerimientoVernalizacion.activada')?.value === true
    );
  }

  get clasificacionTermicaSeleccionada():
    | IClasificacionTermicaCultivo
    | undefined {
    return getClasificacionTermicaCultivo(this.cultivoSeleccionado);
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
    const parametros = this.semilla?.parametrosAgrometeorologicos;
    const gddControls = Object.entries(parametros?.gddPorEtapa || {})
      .sort(
        ([, left], [, right]) =>
          Number(left.orden ?? Number.MAX_SAFE_INTEGER) -
          Number(right.orden ?? Number.MAX_SAFE_INTEGER),
      )
      .map(([etapa, rango]) => this.crearControlGddEtapa(etapa, rango));
    const fotoperiodoControls = Object.entries(
      parametros?.fotoperiodoVarietal?.porEtapa || {},
    ).map(([etapa, perfil]) =>
      this.crearControlFotoperiodoEtapa(etapa, perfil),
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
        modelo: new FormControl(this.semilla?.requerimientoFrio?.modelo || 'HF + Dynamic Model'),
        modeloRector: new FormControl(
          this.semilla?.requerimientoFrio?.modeloRector || 'sin_calibrar'
        ),
        estado: new FormControl(
          this.semilla?.requerimientoFrio?.estado || 'requiere_calibracion'
        ),
        fuente: new FormControl(this.semilla?.requerimientoFrio?.fuente || ''),
        confianza: new FormControl(
          this.semilla?.requerimientoFrio?.confianza || 'estimada'
        ),
        observaciones: new FormControl(
          this.semilla?.requerimientoFrio?.observaciones || ''
        ),
        protocoloTemporada: new FormGroup({
          version: new FormControl(
            this.semilla?.requerimientoFrio?.protocoloTemporada?.version ||
              'chaman-cold-season-protocol-1.0'
          ),
          estado: new FormControl(
            this.semilla?.requerimientoFrio?.protocoloTemporada?.estado ||
              'requiere_calibracion'
          ),
          fuente: new FormControl(
            this.semilla?.requerimientoFrio?.protocoloTemporada?.fuente ||
              ''
          ),
          region: new FormControl(
            this.semilla?.requerimientoFrio?.protocoloTemporada?.region ||
              ''
          ),
          inicioTipo: new FormControl(
            this.semilla?.requerimientoFrio?.protocoloTemporada?.inicio
              ?.tipo || 'biofix'
          ),
          inicioMesDia: new FormControl(
            this.semilla?.requerimientoFrio?.protocoloTemporada?.inicio
              ?.tipo === 'fecha_calendario'
              ? this.semilla.requerimientoFrio.protocoloTemporada.inicio
                  .mesDia
              : ''
          ),
          finTipo: new FormControl(
            this.semilla?.requerimientoFrio?.protocoloTemporada?.fin?.tipo ||
              'biofix'
          ),
          finMesDia: new FormControl(
            this.semilla?.requerimientoFrio?.protocoloTemporada?.fin?.tipo ===
              'fecha_calendario'
              ? this.semilla.requerimientoFrio.protocoloTemporada.fin.mesDia
              : ''
          ),
          observaciones: new FormControl(
            this.semilla?.requerimientoFrio?.protocoloTemporada
              ?.observaciones || ''
          ),
        }),
      }),
      requerimientoVernalizacion: new FormGroup({
        activada: new FormControl(
          this.semilla?.cultivo === 'Arveja' &&
            this.semilla?.parametrosAgrometeorologicos?.procesoTermico ===
              'vernalizacion_anual'
        ),
        habito: new FormControl(
          this.semilla?.parametrosAgrometeorologicos?.habitoVernalizacion ||
            'desconocido'
        ),
        modelo: new FormControl(
          this.semilla?.parametrosAgrometeorologicos?.modeloVernalizacion ||
            'ventana_calibrada'
        ),
        requisito: new FormControl(
          this.semilla?.parametrosAgrometeorologicos
            ?.requerimientoVernalizacion ?? null,
          Validators.min(0.01)
        ),
        temperaturaMinC: new FormControl(
          this.semilla?.parametrosAgrometeorologicos?.rangoVernalizacionC
            ?.min ?? null
        ),
        temperaturaMaxC: new FormControl(
          this.semilla?.parametrosAgrometeorologicos?.rangoVernalizacionC
            ?.max ?? null
        ),
        fuente: new FormControl(
          this.semilla?.parametrosAgrometeorologicos?.fuenteVernalizacion || ''
        ),
        estado: new FormControl(
          this.semilla?.parametrosAgrometeorologicos?.estadoVernalizacion ||
            'requiere_calibracion'
        ),
        inicioEtapa: new FormControl(
          this.semilla?.parametrosAgrometeorologicos
            ?.ventanaVernalizacion?.inicioEtapa ||
            (this.semilla?.cultivo === 'Trigo' ||
            this.semilla?.cultivo === 'Cebada'
              ? 'Emergencia'
              : '')
        ),
        finEtapa: new FormControl(
          this.semilla?.parametrosAgrometeorologicos?.ventanaVernalizacion
            ?.finEtapa ||
            (this.semilla?.cultivo === 'Trigo'
              ? 'Espiguilla Terminal'
              : this.semilla?.cultivo === 'Cebada'
                ? 'Primer Nudo'
                : '')
        ),
      }),
      parametrosTermicos: new FormGroup({
        version: new FormControl(
          parametros?.version || 'chaman-thermal-profile-admin-1.0.0',
          Validators.required,
        ),
        estado: new FormControl(
          parametros?.estado || 'requiere_calibracion',
          Validators.required,
        ),
        fuente: new FormControl(parametros?.fuente || ''),
        temperaturaBaseC: new FormControl(
          parametros?.temperaturaBaseC ?? null,
        ),
        temperaturaSuperiorC: new FormControl(
          parametros?.temperaturaSuperiorC ?? null,
        ),
        profundidadRadicularCm: new FormControl(
          parametros?.profundidadRadicularCm ?? null,
        ),
        gddEtapas: new FormArray(gddControls),
        fotoperiodo: new FormGroup({
          estado: new FormControl(
            parametros?.fotoperiodoVarietal?.estado ||
              'requiere_calibracion',
          ),
          fuente: new FormControl(
            parametros?.fotoperiodoVarietal?.fuente || '',
          ),
          etapas: new FormArray(fotoperiodoControls),
        }),
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
    this.configurarLimpiezaAlCambiarCultivo();
  }

  private configurarLimpiezaAlCambiarCultivo(): void {
    this.cultivoForm$?.unsubscribe();
    const control = this.form?.get('cultivo');
    this.cultivoAnterior = control?.value || null;
    this.cultivoForm$ = control?.valueChanges.subscribe(
      (cultivo: Cultivo | null) => {
        if (
          this.cultivoAnterior &&
          cultivo !== this.cultivoAnterior
        ) {
          this.limpiarPerfilVarietalPorCambioCultivo(cultivo);
        }
        this.cultivoAnterior = cultivo;
      },
    );
  }

  private limpiarPerfilVarietalPorCambioCultivo(
    cultivo: Cultivo | null,
  ): void {
    this.gddEtapas.clear({ emitEvent: false });
    this.fotoperiodoEtapas.clear({ emitEvent: false });
    this.form?.get('parametrosTermicos')?.patchValue(
      {
        version: 'chaman-thermal-profile-admin-1.0.0',
        estado: 'requiere_calibracion',
        fuente: '',
        temperaturaBaseC: null,
        temperaturaSuperiorC: null,
        profundidadRadicularCm: null,
        fotoperiodo: {
          estado: 'requiere_calibracion',
          fuente: '',
        },
      },
      { emitEvent: false },
    );
    this.form?.get('requerimientoFrio')?.reset(
      {
        horasFrio: null,
        horasFrioEfectivas: null,
        porcionesFrio: null,
        modelo: 'HF + Dynamic Model',
        modeloRector: 'sin_calibrar',
        estado: 'requiere_calibracion',
        fuente: '',
        confianza: 'estimada',
        observaciones: '',
        protocoloTemporada: {
          version: 'chaman-cold-season-protocol-1.0',
          estado: 'requiere_calibracion',
          fuente: '',
          region: '',
          inicioTipo: 'biofix',
          inicioMesDia: '',
          finTipo: 'biofix',
          finMesDia: '',
          observaciones: '',
        },
      },
      { emitEvent: false },
    );
    this.form?.get('requerimientoVernalizacion')?.reset(
      {
        activada: false,
        habito: 'desconocido',
        modelo: 'ventana_calibrada',
        requisito: null,
        temperaturaMinC: null,
        temperaturaMaxC: null,
        fuente: '',
        estado: 'requiere_calibracion',
        inicioEtapa:
          cultivo === 'Trigo' || cultivo === 'Cebada'
            ? 'Emergencia'
            : '',
        finEtapa:
          cultivo === 'Trigo'
            ? 'Espiguilla Terminal'
            : cultivo === 'Cebada'
              ? 'Primer Nudo'
              : '',
      },
      { emitEvent: false },
    );
  }

  private crearControlGddEtapa(
    etapa = '',
    rango: {
      orden?: number;
      min?: number;
      max?: number;
      objetivo?: number;
    } = {},
  ): FormGroup {
    return new FormGroup({
      etapa: new FormControl(etapa, Validators.required),
      orden: new FormControl(rango.orden ?? null, [
        Validators.required,
        Validators.min(1),
      ]),
      min: new FormControl(rango.min ?? rango.objetivo ?? null, [
        Validators.required,
        Validators.min(0),
      ]),
      max: new FormControl(rango.max ?? rango.objetivo ?? null, [
        Validators.required,
        Validators.min(0),
      ]),
    });
  }

  private crearControlFotoperiodoEtapa(
    etapa = '',
    perfil: {
      respuesta?: 'dia_corto' | 'dia_largo' | 'neutra';
      umbralHoras?: number;
    } = {},
  ): FormGroup {
    return new FormGroup({
      etapa: new FormControl(etapa, Validators.required),
      respuesta: new FormControl(
        perfil.respuesta || 'neutra',
        Validators.required,
      ),
      umbralHoras: new FormControl(perfil.umbralHoras ?? null, [
        Validators.min(0.01),
        Validators.max(24),
      ]),
    });
  }

  private parametrosTermicosBasePayload(): IParametrosAgrometeorologicos {
    const actuales = this.semilla?.parametrosAgrometeorologicos || {};
    const raw = this.form?.value.parametrosTermicos || {};
    const gddRows = (raw.gddEtapas || []) as Array<{
      etapa?: string;
      orden?: number;
      min?: number;
      max?: number;
    }>;
    const normalizedGdd = gddRows
      .map((row) => ({
        etapa: String(row.etapa || '').trim(),
        orden: this.numeroOpcional(row.orden),
        min: this.numeroOpcional(row.min),
        max: this.numeroOpcional(row.max),
      }))
      .filter((row) => row.etapa);
    this.validarEtapasTermicas(normalizedGdd);
    const gddPorEtapa = normalizedGdd.length
      ? Object.fromEntries(
          normalizedGdd.map((row) => [
            row.etapa,
            {
              orden: row.orden,
              min: row.min,
              max: row.max,
            },
          ]),
        )
      : undefined;

    const photoperiodRaw = raw.fotoperiodo || {};
    const photoperiodRows = (photoperiodRaw.etapas || []) as Array<{
      etapa?: string;
      respuesta?: 'dia_corto' | 'dia_largo' | 'neutra';
      umbralHoras?: number;
    }>;
    const normalizedPhotoperiod = photoperiodRows
      .map((row) => ({
        etapa: String(row.etapa || '').trim(),
        respuesta: row.respuesta || 'neutra',
        umbralHoras: this.numeroOpcional(row.umbralHoras),
      }))
      .filter((row) => row.etapa);
    this.validarEtapasFotoperiodo(normalizedPhotoperiod);
    const fotoperiodoVarietal =
      !this.esCultivoPerenneSeleccionado &&
      normalizedPhotoperiod.length
        ? {
            modelo: 'umbral_por_etapa' as const,
            estado:
              photoperiodRaw.estado ||
              ('requiere_calibracion' as const),
            fuente:
              String(photoperiodRaw.fuente || '').trim() || undefined,
            porEtapa: Object.fromEntries(
              normalizedPhotoperiod.map((row) => [
                row.etapa,
                {
                  respuesta: row.respuesta,
                  umbralHoras:
                    row.respuesta === 'neutra'
                      ? undefined
                      : row.umbralHoras,
                },
              ]),
            ),
          }
        : undefined;

    return {
      ...actuales,
      version:
        String(raw.version || '').trim() ||
        'chaman-thermal-profile-admin-1.0.0',
      estado: raw.estado || 'requiere_calibracion',
      fuente:
        String(raw.fuente || '').trim() || (null as any),
      procesoTermico: this.procesoTermicoSeleccionado(),
      temperaturaBaseC:
        this.numeroOpcional(raw.temperaturaBaseC) ?? (null as any),
      temperaturaSuperiorC:
        this.numeroOpcional(raw.temperaturaSuperiorC) ?? (null as any),
      metodoGdd: 'promedio_limitado',
      // `null` es intencional: el backend lo traduce a $unset para que
      // borrar filas en el editor no reactive valores legacy de Mongo.
      semanticaGddPorEtapa: normalizedGdd.length
        ? 'rangos_acumulados_desde_inicio_termico'
        : (null as any),
      gddPorEtapa: gddPorEtapa || (null as any),
      fotoperiodoVarietal:
        fotoperiodoVarietal || (null as any),
      profundidadRadicularCm:
        this.numeroOpcional(raw.profundidadRadicularCm) ??
        (null as any),
    };
  }

  private parametrosAgrometeorologicosPayload():
    | IParametrosAgrometeorologicos
    | undefined {
    const actuales = this.parametrosTermicosBasePayload();
    const {
      rangoVernalizacionC: _rangoVernalizacionC,
      requerimientoVernalizacion: _requerimientoVernalizacion,
      modeloVernalizacion: _modeloVernalizacion,
      habitoVernalizacion: _habitoVernalizacion,
      fuenteVernalizacion: _fuenteVernalizacion,
      estadoVernalizacion: _estadoVernalizacion,
      ventanaVernalizacion: _ventanaVernalizacion,
      ...sinVernalizacion
    } = actuales;

    if (!this.usaVernalizacionSeleccionada) {
      return sinVernalizacion as IParametrosAgrometeorologicos;
    }

    const vernalizacion = this.form?.value.requerimientoVernalizacion || {};
    const temperaturaMinC = Number(vernalizacion.temperaturaMinC);
    const temperaturaMaxC = Number(vernalizacion.temperaturaMaxC);
    const requisito = Number(vernalizacion.requisito);

    return {
      ...sinVernalizacion,
      version:
        actuales.version || 'chaman-vernalizacion-window-admin-1.0.0',
      procesoTermico: 'vernalizacion_anual',
      estadoVernalizacion:
        vernalizacion.estado || 'requiere_calibracion',
      habitoVernalizacion: vernalizacion.habito || 'desconocido',
      modeloVernalizacion: 'ventana_calibrada',
      requerimientoVernalizacion:
        Number.isFinite(requisito) && requisito > 0
          ? requisito
          : (null as any),
      rangoVernalizacionC:
        Number.isFinite(temperaturaMinC) &&
        Number.isFinite(temperaturaMaxC) &&
        temperaturaMaxC > temperaturaMinC
          ? { min: temperaturaMinC, max: temperaturaMaxC }
          : (null as any),
      fuenteVernalizacion:
        String(vernalizacion.fuente || '').trim() || (null as any),
      ventanaVernalizacion:
        String(vernalizacion.inicioEtapa || '').trim() &&
        String(vernalizacion.finEtapa || '').trim()
          ? {
              inicioEtapa: String(vernalizacion.inicioEtapa).trim(),
              finEtapa: String(vernalizacion.finEtapa).trim(),
              unidad: 'dias_equivalentes',
            }
          : (null as any),
    };
  }

  private procesoTermicoSeleccionado():
    | 'dormancia_perenne'
    | 'vernalizacion_anual'
    | 'termico_fotoperiodico' {
    if (this.esCultivoPerenneSeleccionado) return 'dormancia_perenne';
    return this.usaVernalizacionSeleccionada
      ? 'vernalizacion_anual'
      : 'termico_fotoperiodico';
  }

  private validarEtapasTermicas(
    rows: Array<{
      etapa: string;
      orden?: number;
      min?: number;
      max?: number;
    }>,
  ): void {
    if (!rows.length) return;
    const names = rows.map((row) => row.etapa.toLocaleLowerCase());
    const orders = rows.map((row) => row.orden);
    if (new Set(names).size !== names.length) {
      throw new Error('No puede repetirse una etapa en el perfil GDD.');
    }
    if (
      orders.some(
        (value) =>
          value === undefined ||
          !Number.isInteger(value) ||
          value < 1,
      ) ||
      new Set(orders).size !== orders.length
    ) {
      throw new Error(
        'Cada etapa GDD debe tener un orden entero unico.',
      );
    }
    const sorted = [...rows].sort(
      (left, right) => Number(left.orden) - Number(right.orden),
    );
    sorted.forEach((row, index) => {
      if (
        row.min === undefined ||
        row.max === undefined ||
        row.min < 0 ||
        row.max < row.min
      ) {
        throw new Error(
          `El rango GDD de ${row.etapa} no es valido.`,
        );
      }
      if (
        index > 0 &&
        (row.min <= Number(sorted[index - 1].min) ||
          row.max < Number(sorted[index - 1].max))
      ) {
        throw new Error(
          'Los rangos GDD deben crecer de forma monotónica según el orden de las etapas.',
        );
      }
    });
  }

  private validarEtapasFotoperiodo(
    rows: Array<{
      etapa: string;
      respuesta: 'dia_corto' | 'dia_largo' | 'neutra';
      umbralHoras?: number;
    }>,
  ): void {
    const names = rows.map((row) => row.etapa.toLocaleLowerCase());
    if (new Set(names).size !== names.length) {
      throw new Error(
        'No puede repetirse una etapa en el perfil fotoperiódico.',
      );
    }
    rows.forEach((row) => {
      if (
        row.respuesta !== 'neutra' &&
        (row.umbralHoras === undefined ||
          row.umbralHoras <= 0 ||
          row.umbralHoras > 24)
      ) {
        throw new Error(
          `La etapa ${row.etapa} necesita un umbral fotoperiódico entre 0 y 24 h.`,
        );
      }
    });
  }

  private numeroOpcional(value: unknown): number | undefined {
    if (value === '' || value === null || value === undefined) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private requerimientoFrioPayload():
    | ICreateSemilla['requerimientoFrio']
    | undefined {
    if (!this.esCultivoPerenneSeleccionado) return undefined;
    const raw = this.form?.value.requerimientoFrio || {};
    const protocol = raw.protocoloTemporada || {};
    const monthDay = (value: unknown): string | undefined => {
      const normalized = String(value || '').trim();
      return /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(normalized)
        ? normalized
        : undefined;
    };
    const inicio =
      protocol.inicioTipo === 'fecha_calendario'
        ? monthDay(protocol.inicioMesDia)
          ? {
              tipo: 'fecha_calendario' as const,
              mesDia: monthDay(protocol.inicioMesDia)!,
            }
          : undefined
        : {
            tipo: 'biofix' as const,
            objetivo: 'inicio_acumulacion_frio' as const,
          };
    const fin =
      protocol.finTipo === 'fecha_calendario'
        ? monthDay(protocol.finMesDia)
          ? {
              tipo: 'fecha_calendario' as const,
              mesDia: monthDay(protocol.finMesDia)!,
            }
          : undefined
        : {
            tipo: 'biofix' as const,
            objetivo: 'fin_acumulacion_frio' as const,
          };
    const protocoloTemporada =
      inicio && fin
        ? {
            version:
              String(protocol.version || '').trim() ||
              'chaman-cold-season-protocol-1.0',
            estado:
              protocol.estado || ('requiere_calibracion' as const),
            fuente: String(protocol.fuente || '').trim() || undefined,
            region: String(protocol.region || '').trim() || undefined,
            inicio,
            fin,
            observaciones:
              String(protocol.observaciones || '').trim() || undefined,
          }
        : undefined;
    return {
      horasFrio: this.numeroOpcional(raw.horasFrio),
      horasFrioEfectivas: this.numeroOpcional(raw.horasFrioEfectivas),
      porcionesFrio: this.numeroOpcional(raw.porcionesFrio),
      modelo: raw.modelo || undefined,
      modeloRector: raw.modeloRector || undefined,
      estado: raw.estado || undefined,
      fuente: String(raw.fuente || '').trim() || undefined,
      confianza: raw.confianza || undefined,
      observaciones:
        String(raw.observaciones || '').trim() || undefined,
      protocoloTemporada,
    };
  }

  public agregarResistencia(): void {
    this.resistencia.push(this.crearControlResistencia());
  }

  public borrarResistencia(index: number): void {
    this.resistencia.removeAt(index);
  }

  public agregarEtapaGdd(): void {
    this.gddEtapas.push(
      this.crearControlGddEtapa('', {
        orden: this.gddEtapas.length + 1,
      }),
    );
  }

  public borrarEtapaGdd(index: number): void {
    this.gddEtapas.removeAt(index);
  }

  public agregarEtapaFotoperiodo(): void {
    this.fotoperiodoEtapas.push(
      this.crearControlFotoperiodoEtapa(),
    );
  }

  public borrarEtapaFotoperiodo(index: number): void {
    this.fotoperiodoEtapas.removeAt(index);
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
        requerimientoFrio: this.requerimientoFrioPayload(),
        parametrosAgrometeorologicos:
          this.parametrosAgrometeorologicosPayload(),
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
    this.cultivoForm$?.unsubscribe();
  }

}
