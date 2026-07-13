import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { SiembraService } from '../../../../../auxiliares/http/siembra.service';
import { ClimaService } from '../../../../../auxiliares/http/clima.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetallesLote } from '../detalles-lote.component';
import {
  esPlantacionPerenneJoven,
  esCultivoPerenne,
  getEdadPerenneAnios,
  getFenologiaJuvenilPerenne,
  getEtapasPerennesReferencia,
  getNombreImplantacion,
  IFenologiaReferencia,
  IEstadoFenologiaArveja,
  IFrioTermicoCultivo,
  IRegistroFenologico,
  ISemilla,
  ISiembra,
  construirHitosFenologiaArveja,
  resolverFenologiaTermicaArveja,
} from 'modelos/src';
import {
  ETAPAS_CEBADA,
  ETAPAS_MAIZ,
  ETAPAS_SOJA,
  ETAPAS_TRIGO,
} from '../drawer-grafico-enfermedades/drawer-grafico-enfermedades.component';

interface FenologiaStage {
  nombre: string;
  codigo?: string;
  fecha?: Date;
  periodoDias?: number;
  posicion: number;
  estado: 'done' | 'current' | 'pending';
  umbralMinGdd?: number;
  umbralMaxGdd?: number;
  requiereCampo?: boolean;
}

type FuenteFenologia = 'crono' | 'semilla' | 'base';

interface RegistroFenologicoForm {
  fecha: Date;
  etapa: string;
  observaciones: string;
}

const ETAPAS_BASE_POR_CULTIVO: Record<string, Record<string, number>> = {
  Trigo: {
    R0_R1: 12,
    R1_R2: 65,
    R2_R3: 18,
    R3_R4: 14,
    R4_R5: 5,
    R5_R6: 18,
    R6_R7: 25,
  },
  Soja: {
    siembra_emergencia: 8,
    emergencia_R1: 35,
    R1_R3: 18,
    R3_R5: 28,
    R5_R7: 38,
  },
  Maiz: {
    siembra_emergencia: 8,
    emergencia_floracion: 65,
    floracion_madurez: 55,
  },
  Cebada: {
    siembra_emergencia: 15,
    emergencia_primer_nudo: 67,
    primer_nudo_hoja_bandera: 14,
    hoja_bandera_espigazon: 18,
    espigazon_antesis: 7,
    antesis_llenado_granos: 4,
    llenado_granos_madurez_fisiologica: 30,
  },
  Papa: {
    Plantacion: 0,
    Emergencia: 18,
    Desarrollo_vegetativo: 24,
    Tuberizacion: 28,
    Llenado_de_tuberculos: 38,
    Madurez_y_cosecha: 22,
  },
  Vid: {
    Dormancia: 0,
    Brotacion: 28,
    Floracion: 35,
    Cuaje: 18,
    Envero: 55,
    Madurez: 45,
    Cosecha: 20,
  },
  Manzano: {
    Reposo_invernal: 0,
    Yema_hinchada: 35,
    Brotacion: 18,
    Floracion: 18,
    Cuaje: 15,
    Desarrollo_de_fruto: 95,
    Madurez: 35,
    Cosecha: 20,
  },
  Peral: {
    Reposo_invernal: 0,
    Yema_hinchada: 32,
    Brotacion: 16,
    Floracion: 16,
    Cuaje: 14,
    Desarrollo_de_fruto: 90,
    Madurez: 30,
    Cosecha: 20,
  },
  Pecan: {
    Dormancia: 0,
    Brotacion: 40,
    Floracion: 25,
    Cuaje: 20,
    Llenado_de_nuez: 90,
    Madurez: 45,
    Cosecha: 30,
  },
};

@Component({
  selector: 'app-card-etapas-fenologicas',
  imports: [CommonModule, SharedModule],
  templateUrl: './card-etapas-fenologicas.component.html',
  styleUrl: './card-etapas-fenologicas.component.scss',
})
export class CardEtapasFenologicasComponent implements OnInit, OnChanges, OnDestroy {
  @Input() public lote?: IDetallesLote;
  @Input() public siembra?: ISiembra;
  @Output() public estadoFenologiaTermicaChange = new EventEmitter<IEstadoFenologiaArveja | undefined>();
  public etapaActual?: string;
  public cultivo?: string;
  public cultivoClass = 'cultivo-trigo';
  public progreso = 0;
  public etapas: FenologiaStage[] = [];
  public fuenteFenologia: FuenteFenologia = 'crono';
  public fuenteTexto = 'crono cargado';
  public esPerenne = false;
  public plantacionJoven = false;
  public edadPlantacionAnios?: number;
  public edadProductivaDesdeAnios?: number;
  public fuenteFenologiaJoven = '';
  public etiquetaImplantacion: 'Siembra' | 'Plantacion' = 'Siembra';
  public campaniaTexto = '';
  public fenologiaTermica?: IFenologiaReferencia;
  public datosFenologiaTermica?: IFrioTermicoCultivo;
  public estadoFenologiaTermica?: IEstadoFenologiaArveja;
  public cargandoFenologiaTermica = false;
  public errorFenologiaTermica = '';
  public registroDialogVisible = false;
  public guardandoRegistro = false;
  public registroEditandoId?: string;
  public registroForm: RegistroFenologicoForm = {
    fecha: new Date(),
    etapa: '',
    observaciones: '',
  };
  private readonly diaMs = 86400000;
  private solicitudFenologiaTermica = 0;
  private ultimoKeyFenologiaTermica = '';

  public get timelineMinWidth(): string {
    const etapasVisibles = Math.max(this.etapas.length, 1);
    return `${Math.max(720, etapasVisibles * 150)}px`;
  }

  public get etapaActualDetalle(): FenologiaStage | undefined {
    return this.etapas.find((etapa) => etapa.estado === 'current') || this.etapas[0];
  }

  public get etapaAnteriorDetalle(): FenologiaStage | undefined {
    const index = this.indiceEtapaActual();
    return index > 0 ? this.etapas[index - 1] : undefined;
  }

  public get proximaEtapaDetalle(): FenologiaStage | undefined {
    const index = this.indiceEtapaActual();
    if (index < 0) return undefined;
    return this.etapas[index + 1];
  }

  public get siembraActual(): ISiembra | undefined {
    return this.siembra || this.lote?.siembra;
  }

  public get registrosFenologicos(): IRegistroFenologico[] {
    return [...(this.siembraActual?.registrosFenologicos || [])].sort((a, b) =>
      String(a.fecha || '').localeCompare(String(b.fecha || '')),
    );
  }

  public get ultimoRegistroFenologico(): IRegistroFenologico | undefined {
    return this.registrosFenologicos[this.registrosFenologicos.length - 1];
  }

  public get etapaOptions(): Array<{ label: string; value: string }> {
    return this.etapasRegistroNombres.map((nombre) => ({ label: nombre, value: nombre }));
  }

  public get puedeRegistrarFenologiaCampo(): boolean {
    return !!this.siembraActual?._id && this.etapasRegistroNombres.length > 0;
  }

  public get etapasRegistroNombres(): string[] {
    if (this.etapas.length) return this.etapas.map((etapa) => etapa.nombre);
    const observables = this.fenologiaTermica?.etapasObservables || [];
    return [...new Set(observables.map((etapa) => String(etapa).trim()).filter(Boolean))];
  }

  public get rangosTermicos(): Array<{ etapa: string; min: number; max: number }> {
    return Object.entries(this.fenologiaTermica?.rangosTermicos || {}).map(([etapa, rango]) => ({
      etapa,
      min: Number(rango.min),
      max: Number(rango.max),
    }));
  }

  public get fuenteFenologiaTermicaTexto(): string {
    if (this.estadoFenologiaTermica?.fuente === 'campo') return 'Campo + contraste termico';
    if (this.datosFenologiaTermica?.fuente === 'FieldClimate + OpenMeteo') return 'FieldClimate + respaldo Open-Meteo';
    if (this.datosFenologiaTermica?.fuente === 'FieldClimate') return 'FieldClimate asociado';
    if (this.datosFenologiaTermica?.fuente === 'OpenMeteo') return 'Open-Meteo automatico';
    return 'Sin clima consolidado';
  }

  public get estadoModeloTermicoTexto(): string {
    if (this.estadoFenologiaTermica?.fuente === 'campo') return 'confirmado en campo';
    if (this.errorFenologiaTermica) return 'dato climatico pendiente';
    if (this.cargandoFenologiaTermica) return 'calculando';
    return this.fenologiaTermica?.estadoModelo === 'validado'
      ? 'validado'
      : this.fenologiaTermica?.estadoModelo === 'referencia'
        ? 'referencia operativa'
        : 'calibracion pendiente';
  }

  public get gradosDiaFenologiaTexto(): string {
    const valor = this.estadoFenologiaTermica?.gradosDiaAcumulados;
    return valor === undefined ? 'Sin acumulado' : `${valor.toFixed(1)} GDD acumulados`;
  }

  public get diasDesdeImplantacion(): number {
    const fecha = this.siembra?.fechaSiembra || this.lote?.siembra?.fechaSiembra;
    if (!fecha) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(fecha).getTime()) / this.diaMs));
  }

  public get diasDesdeEtapaActual(): number {
    const actual = this.etapaActualDetalle;
    if (!actual?.fecha) return 0;
    return Math.max(0, Math.floor((Date.now() - actual.fecha.getTime()) / this.diaMs));
  }

  public get diasHastaProximaEtapa(): number | undefined {
    const proxima = this.proximaEtapaDetalle;
    if (!proxima?.fecha) return undefined;
    return Math.max(0, Math.ceil((proxima.fecha.getTime() - Date.now()) / this.diaMs));
  }

  public get duracionEtapaActual(): number | undefined {
    const actual = this.etapaActualDetalle;
    const proxima = this.proximaEtapaDetalle;
    if (!actual?.fecha || !proxima?.fecha) return undefined;
    return Math.max(1, Math.round((proxima.fecha.getTime() - actual.fecha.getTime()) / this.diaMs));
  }

  public get progresoEtapaActual(): number {
    if (this.estadoFenologiaTermica) {
      return this.estadoFenologiaTermica.progresoEtapaPct;
    }
    const duracion = this.duracionEtapaActual;
    if (!duracion) {
      return this.proximaEtapaDetalle ? 0 : 100;
    }
    return this.limitar((this.diasDesdeEtapaActual / duracion) * 100);
  }

  public get lecturaEtapaActual(): string {
    const actual = this.etapaActualDetalle;
    if (!actual) {
      return 'No hay datos suficientes para ubicar el lote en el ciclo.';
    }
    if (this.fenologiaTermica && this.estadoFenologiaTermica) {
      if (this.estadoFenologiaTermica.fuente === 'campo') {
        return `Etapa confirmada por observacion de campo. El modelo termico queda como contraste y no reemplaza el registro real.`;
      }
      if (this.cargandoFenologiaTermica) {
        return 'Calculando grados-dia desde la fecha de siembra con la fuente climatica disponible.';
      }
      const gdd = this.estadoFenologiaTermica.gradosDiaAcumulados;
      const base = this.fenologiaTermica.temperaturaBaseC;
      const fuente = this.datosFenologiaTermica?.fuente || 'sin fuente climatica';
      return gdd === undefined
        ? `Etapa inicial de referencia. Falta clima historico para calcular el avance termico.`
        : `Estimacion con ${gdd.toFixed(1)} GDD desde la siembra, Tb ${base ?? '-'} C, fuente ${fuente}. Confirmar visualmente antes de decisiones sanitarias.`;
    }
    if (this.plantacionJoven) {
      const edad = this.edadPlantacionLabel;
      const productiva = this.edadProductivaDesdeAnios
        ? ` Entrada productiva estimada desde ${this.edadProductivaDesdeAnios} años, ajustable por tecnico.`
        : '';
      return `Plantacion joven (${edad}): seguimos estructura vegetativa y sanidad, sin proyectar cosecha hasta confirmar entrada productiva.${productiva}`;
    }
    const proxima = this.proximaEtapaDetalle;
    if (proxima) {
      const dias = this.diasHastaProximaEtapa ?? 0;
      return `Transitamos ${actual.nombre} desde hace ${this.diasDesdeEtapaActual} d. Proximo hito: ${proxima.nombre} en ${dias} d.`;
    }
    return `El ciclo esta en ${actual.nombre}. Revisar cosecha o cierre operativo si corresponde.`;
  }

  public get resumenFenologico(): string {
    const fuente = this.fenologiaTermica
      ? this.estadoFenologiaTermica?.fuente === 'campo'
        ? 'registro de campo prioritario'
        : 'modelo termico auditable'
      : this.plantacionJoven
      ? 'plantacion joven'
      : this.esPerenne
        ? 'campania perenne'
        : this.fuenteTexto;
    const campania = this.campaniaTexto ? ` ${this.campaniaTexto}` : '';
    return `${this.cultivo || 'Cultivo'} - ${this.etapas.length} etapas - ${fuente}${campania}`;
  }

  public get edadPlantacionLabel(): string {
    if (this.edadPlantacionAnios === undefined) return 'edad sin calcular';
    return this.edadPlantacionAnios === 1
      ? '1 año'
      : `${this.edadPlantacionAnios} años`;
  }

  public get detalleEdadProductiva(): string {
    if (!this.plantacionJoven) return 'desde el inicio';
    if (!this.edadProductivaDesdeAnios) return 'entrada productiva por validar';
    return `productiva desde ${this.edadProductivaDesdeAnios} años`;
  }

  public get siguienteHitoTexto(): string {
    const proxima = this.proximaEtapaDetalle;
    if (!proxima) return 'Sin proximo hito';
    if (proxima.requiereCampo) return `${proxima.codigo || 'R3'}: confirmar en campo`;
    if (!proxima.fecha && proxima.umbralMinGdd !== undefined) {
      return `${proxima.codigo || proxima.nombre}: ${proxima.umbralMinGdd}-${proxima.umbralMaxGdd} GDD`;
    }
    const dias = this.diasHastaProximaEtapa ?? 0;
    if (dias === 0) return `${proxima.nombre} puede estar iniciando`;
    return `${proxima.nombre} en ${dias} d`;
  }

  public etapaEstadoTexto(etapa: FenologiaStage, index: number): string {
    if (etapa.estado === 'current') return 'Ahora';
    if (etapa.estado === 'done') return 'Pasada';
    const actual = this.indiceEtapaActual();
    if (index === actual + 1) return 'Proxima';
    return 'Pendiente';
  }

  public etapaDetalleTexto(etapa: FenologiaStage, index: number): string {
    if (etapa.requiereCampo) return 'Sin umbral en la fuente; observar en campo';
    if (etapa.umbralMinGdd !== undefined) {
      if (etapa.umbralMinGdd === 0 && etapa.umbralMaxGdd === 0) return 'Inicio de la acumulacion termica';
      return `${etapa.umbralMinGdd}-${etapa.umbralMaxGdd} GDD acumulados`;
    }
    if (etapa.estado === 'current') {
      const duracion = this.duracionEtapaActual;
      return duracion ? `${this.diasDesdeEtapaActual} de ${duracion} d` : `${this.diasDesdeEtapaActual} d`;
    }
    if (index === 0) {
      return `${this.etiquetaImplantacion} inicial`;
    }
    if (etapa.periodoDias) {
      return `${etapa.periodoDias} d desde la etapa anterior`;
    }
    return 'Hito del ciclo';
  }

  public etapaProgreso(etapa: FenologiaStage): number {
    if (etapa.estado === 'done') return 100;
    if (etapa.estado === 'current') return this.progresoEtapaActual;
    return 0;
  }

  public registroEtapa(etapa: FenologiaStage): IRegistroFenologico | undefined {
    return this.buscarRegistroEtapa(etapa.nombre);
  }

  private buscarRegistroEtapa(nombre: string): IRegistroFenologico | undefined {
    return this.registrosFenologicos.find(
      (registro) =>
        (registro.etapa === nombre ||
          (this.cultivo === 'Arveja' && this.codigoEtapaArveja(registro.etapa) === this.codigoEtapaArveja(nombre))) &&
        (!this.campaniaTexto || !registro.campania || registro.campania === this.campaniaTexto) &&
        (registro.accion || 'inicio') === 'inicio',
    );
  }

  public textoBotonRegistro(etapa: FenologiaStage): string {
    return this.registroEtapa(etapa) ? 'Editar inicio' : 'Registrar inicio';
  }

  public abrirRegistroEtapa(etapa?: FenologiaStage): void {
    if (!this.puedeRegistrarFenologiaCampo) {
      this.helper.notifWarn('No hay una siembra activa o etapas fenologicas disponibles para registrar.');
      return;
    }

    const nombreEtapa = etapa?.nombre || this.etapaActualDetalle?.nombre || this.etapasRegistroNombres[0];
    if (!this.siembraActual?._id || !nombreEtapa) {
      this.helper.notifWarn('No hay siembra activa o etapa disponible para registrar.');
      return;
    }

    const existente = this.buscarRegistroEtapa(nombreEtapa);
    this.registroEditandoId = existente?.id;
    this.registroForm = {
      fecha: existente?.fecha ? new Date(existente.fecha) : etapa?.fecha ? new Date(etapa.fecha) : new Date(),
      etapa: existente?.etapa || nombreEtapa,
      observaciones: existente?.observaciones || '',
    };
    this.registroDialogVisible = true;
  }

  public async guardarRegistroFenologico(): Promise<void> {
    const siembra = this.siembraActual;
    if (!this.puedeRegistrarFenologiaCampo) {
      this.helper.notifWarn('No hay una siembra activa o etapas fenologicas disponibles para registrar.');
      return;
    }

    if (!siembra?._id || !this.registroForm.etapa) {
      this.helper.notifWarn('Selecciona una etapa fenologica para registrar.');
      return;
    }

    const fechaRegistro = this.normalizarFechaRegistro(this.registroForm.fecha);
    const registro: IRegistroFenologico = {
      id: this.registroEditandoId,
      fecha: fechaRegistro.toISOString(),
      accion: 'inicio',
      etapa: this.registroForm.etapa,
      cultivo: siembra.semilla?.cultivo,
      variedad: siembra.semilla?.variedad,
      ciclo: siembra.semilla?.ciclo,
      campania: this.campaniaTexto || undefined,
      idLote: siembra.idLote || this.lote?._id,
      idSiembra: siembra._id,
      idSemilla: siembra.idSemilla,
      edadPlantacionAnios: this.edadPlantacionAnios,
      diasDesdeImplantacion: this.getDiasDesdeFechaBase(siembra.fechaSiembra, fechaRegistro),
      diasDesdeCampania: this.getDiasDesdeInicioCampania(fechaRegistro),
      fuenteFenologia: this.fuenteTexto,
      requerimientoFrio: siembra.semilla?.requerimientoFrio,
      fenologiaReferencia: siembra.semilla?.fenologiaReferencia,
      frioAcumulado: this.getFrioAcumuladoSnapshot(),
      observaciones: this.registroForm.observaciones?.trim() || undefined,
    };

    try {
      this.guardandoRegistro = true;
      const actualizado = await this.siembraService.registrarEtapaFenologica(siembra._id, registro);
      this.siembra = actualizado;
      if (this.lote?.siembra) {
        this.lote.siembra = actualizado;
      }
      this.crearTimeline();
      this.registroDialogVisible = false;
      this.helper.notifSuccess('Etapa fenologica registrada.');
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.guardandoRegistro = false;
    }
  }

  constructor(
    public helper: HelperService,
    private siembraService: SiembraService,
    private climaService: ClimaService,
  ) {}

  ngOnInit(): void {
    this.crearTimeline();
    void this.cargarFenologiaTermicaArveja();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lote'] || changes['siembra']) {
      this.crearTimeline();
      void this.cargarFenologiaTermicaArveja();
    }
  }

  private crearTimeline(): void {
    const siembra = this.siembra || this.lote?.siembra;
    const crono = siembra?.crono;

    if (!siembra?.fechaSiembra || !siembra.semilla?.cultivo) {
      this.etapas = [];
      this.fenologiaTermica = undefined;
      this.etapaActual = undefined;
      this.progreso = 0;
      return;
    }

    const cultivo = this.canonicalCultivo(siembra.semilla.cultivo);
    const etapasCrono = crono?.etapas as Record<string, number | string> | undefined;
    const fechas: Date[] = [];
    let etapaActualNumero = -1;
    let etapasConfig: { nombres: string[]; claves: string[] } = { nombres: [], claves: [] };

    this.cultivo = siembra.semilla.cultivo || cultivo;
    this.cultivoClass = `cultivo-${this.normalizarCultivo(cultivo)}`;
    this.esPerenne = esCultivoPerenne(cultivo);
    this.etiquetaImplantacion = getNombreImplantacion(cultivo);
    this.edadPlantacionAnios = getEdadPerenneAnios(siembra.fechaSiembra);
    const edadProductivaSemilla = Number(siembra.semilla?.fenologiaReferencia?.edadProductivaDesdeAnios);
    const fenologiaJoven = getFenologiaJuvenilPerenne(cultivo);
    this.edadProductivaDesdeAnios = Number.isFinite(edadProductivaSemilla)
      ? edadProductivaSemilla
      : fenologiaJoven?.edadProductivaDesdeAnios;
    this.plantacionJoven = esPlantacionPerenneJoven(
      cultivo,
      siembra.fechaSiembra,
      new Date(),
      this.edadProductivaDesdeAnios,
    );
    this.fuenteFenologiaJoven = fenologiaJoven?.fuente || '';
    this.campaniaTexto = '';
    this.fenologiaTermica = siembra.semilla?.fenologiaReferencia?.unidadEtapas === 'grados_dia'
      ? siembra.semilla.fenologiaReferencia
      : undefined;

    const etapasDisponibles = this.getEtapasDisponibles(cultivo, siembra.semilla, etapasCrono);

    if (this.esPerenne) {
      this.crearTimelinePerenne(cultivo, etapasDisponibles);
      return;
    }

    const fechaBase = new Date(siembra.fechaSiembra);

    switch (cultivo) {
      case 'Trigo':
        if (crono) {
          etapaActualNumero = HelperService.getEtapaPorFechaTrigo(siembra, new Date().toISOString(), crono);
        } else {
          etapaActualNumero = this.getEtapaGenericaPorFecha(fechaBase, ['Siembra', ...Object.keys(etapasDisponibles)], etapasDisponibles);
        }
        etapasConfig = {
          nombres: ETAPAS_TRIGO,
          claves: ['Siembra', 'R0_R1', 'R1_R2', 'R2_R3', 'R3_R4', 'R4_R5', 'R5_R6', 'R6_R7'],
        };
        break;
      case 'Soja': {
        if (crono) {
          const etapaSojaStr = HelperService.getEtapaPorFechaSoja(siembra, new Date().toISOString(), crono);
          etapaActualNumero = HelperService.etapaSojaANumero(etapaSojaStr);
        } else {
          etapaActualNumero = this.getEtapaGenericaPorFecha(fechaBase, ['Siembra', ...Object.keys(etapasDisponibles)], etapasDisponibles);
        }
        etapasConfig = {
          nombres: ETAPAS_SOJA,
          claves: ['siembra', 'siembra_emergencia', 'emergencia_R1', 'R1_R3', 'R3_R5', 'R5_R7'],
        };
        break;
      }
      case 'Maiz': {
        if (crono) {
          const etapaMaizStr = HelperService.getEtapaPorFechaMaiz(siembra, new Date().toISOString(), crono);
          etapaActualNumero = HelperService.etapaMaizANumero(etapaMaizStr);
        } else {
          etapaActualNumero = this.getEtapaGenericaPorFecha(fechaBase, ['Siembra', ...Object.keys(etapasDisponibles)], etapasDisponibles);
        }
        etapasConfig = {
          nombres: ETAPAS_MAIZ,
          claves: ['siembra', 'siembra_emergencia', 'emergencia_floracion', 'floracion_madurez'],
        };
        break;
      }
      case 'Cebada': {
        if (crono) {
          const etapaCebadaStr = HelperService.getEtapaPorFechaCebada(siembra, new Date().toISOString(), crono);
          etapaActualNumero = HelperService.etapaCebadaANumero(etapaCebadaStr);
        } else {
          etapaActualNumero = this.getEtapaGenericaPorFecha(fechaBase, ['Siembra', ...Object.keys(etapasDisponibles)], etapasDisponibles);
        }
        etapasConfig = {
          nombres: ETAPAS_CEBADA,
          claves: [
            'siembra',
            'siembra_emergencia',
            'emergencia_primer_nudo',
            'primer_nudo_hoja_bandera',
            'hoja_bandera_espigazon',
            'espigazon_antesis',
            'antesis_llenado_granos',
            'llenado_granos_madurez_fisiologica',
          ],
        };
        break;
      }
      default:
        etapasConfig = this.crearEtapasGenericas(etapasDisponibles);
        etapaActualNumero = this.getEtapaGenericaPorFecha(fechaBase, etapasConfig.claves, etapasDisponibles);
        break;
    }

    if (!etapasConfig.nombres.length) {
      if (cultivo === 'Arveja' && this.fenologiaTermica) {
        this.crearTimelineTermicaArveja();
      } else {
        this.etapas = [];
        this.etapaActual = undefined;
        this.progreso = 0;
      }
      return;
    }

    const cursor = new Date(fechaBase);
    etapasConfig.nombres.forEach((_, index) => {
      const dias = index > 0 ? this.getDuracionEtapa(etapasDisponibles, etapasConfig.claves[index]) : 0;
      cursor.setDate(cursor.getDate() + dias);
      fechas.push(new Date(cursor));
    });

    const fechaInicio = fechas[0].getTime();
    const fechaFin = fechas[fechas.length - 1].getTime();
    const duracionTotal = Math.max(fechaFin - fechaInicio, 1);
    this.progreso = this.limitar(((Date.now() - fechaInicio) / duracionTotal) * 100);
    this.etapaActual =
      etapaActualNumero > -1 ? etapasConfig.nombres[etapaActualNumero] : etapasConfig.nombres[0];

    this.etapas = etapasConfig.nombres.map((nombre, index) => {
      const posicion = this.posicionUniforme(index, etapasConfig.nombres.length);
      const estado = index < etapaActualNumero ? 'done' : index === etapaActualNumero ? 'current' : 'pending';
      const periodoDias =
        index > 0 ? Math.max(1, Math.round((fechas[index].getTime() - fechas[index - 1].getTime()) / this.diaMs)) : undefined;

      return {
        nombre,
        fecha: fechas[index],
        periodoDias,
        posicion,
        estado,
      };
    });
  }

  private async cargarFenologiaTermicaArveja(): Promise<void> {
    const siembra = this.siembraActual;
    const cultivo = this.canonicalCultivo(siembra?.semilla?.cultivo);
    const referencia = siembra?.semilla?.fenologiaReferencia;
    if (cultivo !== 'Arveja' || referencia?.unidadEtapas !== 'grados_dia' || !siembra?.fechaSiembra) {
      this.datosFenologiaTermica = undefined;
      this.estadoFenologiaTermica = undefined;
      this.estadoFenologiaTermicaChange.emit(undefined);
      this.errorFenologiaTermica = '';
      this.cargandoFenologiaTermica = false;
      this.ultimoKeyFenologiaTermica = '';
      return;
    }

    const coordenadas = siembra.coordenadas || this.lote?.ubicacion?.centro;
    const lat = Number(coordenadas?.lat);
    const lng = Number(coordenadas?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      this.datosFenologiaTermica = undefined;
      this.errorFenologiaTermica = 'Falta la ubicacion del lote para calcular grados-dia.';
      this.crearTimelineTermicaArveja();
      return;
    }

    const key = [lat, lng, siembra.fechaSiembra, siembra.semilla?.variedad, referencia.temperaturaBaseC].join('|');
    if (key === this.ultimoKeyFenologiaTermica && (this.cargandoFenologiaTermica || this.datosFenologiaTermica)) {
      return;
    }
    this.ultimoKeyFenologiaTermica = key;
    this.datosFenologiaTermica = undefined;
    const solicitud = ++this.solicitudFenologiaTermica;
    const hitos = construirHitosFenologiaArveja(referencia);
    const emergencia = hitos.find((hito) => hito.codigo === 'E');
    const floracion = hitos.find((hito) => hito.codigo === 'R1');
    const medio = (min?: number, max?: number): number | undefined =>
      Number.isFinite(min) && Number.isFinite(max) ? (Number(min) + Number(max)) / 2 : undefined;

    this.cargandoFenologiaTermica = true;
    this.errorFenologiaTermica = '';
    this.crearTimelineTermicaArveja();
    try {
      const data = await this.climaService.getFrioTermico(lat, lng, {
        cultivo: 'Arveja',
        variedad: siembra.semilla?.variedad,
        fechaSiembra: String(siembra.fechaSiembra).slice(0, 10),
        idEstacionMeteorologica: this.lote?.establecimiento?.idEstacionMeteorologica,
        temperaturaBaseGradosDia: referencia.temperaturaBaseC,
        gradosDiaBrotacionObjetivo: medio(emergencia?.umbralMinGdd, emergencia?.umbralMaxGdd),
        gradosDiaFloracionObjetivo: medio(floracion?.umbralMinGdd, floracion?.umbralMaxGdd),
      });
      if (solicitud !== this.solicitudFenologiaTermica) return;
      this.datosFenologiaTermica = data;
    } catch (error: any) {
      if (solicitud !== this.solicitudFenologiaTermica) return;
      this.datosFenologiaTermica = undefined;
      this.errorFenologiaTermica =
        error?.error?.message || error?.message || 'No se pudo obtener el clima historico para la fenologia.';
    } finally {
      if (solicitud === this.solicitudFenologiaTermica) {
        this.cargandoFenologiaTermica = false;
        this.crearTimelineTermicaArveja();
      }
    }
  }

  private crearTimelineTermicaArveja(): void {
    const siembra = this.siembraActual;
    const referencia = this.fenologiaTermica || siembra?.semilla?.fenologiaReferencia;
    if (!siembra?.fechaSiembra || referencia?.unidadEtapas !== 'grados_dia') {
      this.etapas = [];
      this.etapaActual = undefined;
      this.estadoFenologiaTermica = undefined;
      this.estadoFenologiaTermicaChange.emit(undefined);
      this.progreso = 0;
      return;
    }

    const ultimoCampo = this.ultimoRegistroFenologico;
    const estado = resolverFenologiaTermicaArveja({
      referencia,
      gradosDiaAcumulados: this.datosFenologiaTermica?.acumulados.gradosDia,
      etapaCampo: ultimoCampo?.etapa,
    });
    this.estadoFenologiaTermica = estado;
    this.estadoFenologiaTermicaChange.emit(estado);
    this.etapaActual = estado.nombre;
    this.fuenteFenologia = 'semilla';
    this.fuenteTexto = estado.fuente === 'campo' ? 'registro de campo prioritario' : 'modelo termico auditable';

    const madurez = estado.hitos.find((hito) => hito.codigo === 'MF');
    const objetivoTotal = madurez?.umbralMinGdd !== undefined && madurez.umbralMaxGdd !== undefined
      ? (madurez.umbralMinGdd + madurez.umbralMaxGdd) / 2
      : undefined;
    this.progreso = objetivoTotal && estado.gradosDiaAcumulados !== undefined
      ? this.limitar((estado.gradosDiaAcumulados / objetivoTotal) * 100)
      : 0;

    this.etapas = estado.hitos.map((hito, index) => {
      const registro = this.registroPorCodigoArveja(hito.codigo);
      return {
        codigo: hito.codigo,
        nombre: hito.nombre,
        fecha: registro?.fecha
          ? new Date(registro.fecha)
          : this.fechaHitoTermicoArveja(hito.umbralMinGdd, hito.umbralMaxGdd, hito.codigo),
        posicion: this.posicionUniforme(index, estado.hitos.length),
        estado: index < estado.indice ? 'done' : index === estado.indice ? 'current' : 'pending',
        umbralMinGdd: hito.umbralMinGdd,
        umbralMaxGdd: hito.umbralMaxGdd,
        requiereCampo: !hito.calculable,
      };
    });
  }

  private fechaHitoTermicoArveja(
    min?: number,
    max?: number,
    codigo?: string,
  ): Date | undefined {
    const fechaSiembra = this.siembraActual?.fechaSiembra;
    if (codigo === 'S') return fechaSiembra ? new Date(fechaSiembra) : undefined;
    if (!Number.isFinite(min) || !Number.isFinite(max)) return undefined;
    const objetivo = (Number(min) + Number(max)) / 2;
    const desde = String(fechaSiembra || '').slice(0, 10);
    let acumulado = 0;
    for (const dia of this.datosFenologiaTermica?.serie || []) {
      if (dia.fecha < desde) continue;
      acumulado += Number(dia.gradosDia || 0);
      if (acumulado >= objetivo) return new Date(`${dia.fecha}T12:00:00`);
    }
    return undefined;
  }

  private registroPorCodigoArveja(codigo: string): IRegistroFenologico | undefined {
    return [...this.registrosFenologicos]
      .reverse()
      .find((registro) => this.codigoEtapaArveja(registro.etapa) === codigo);
  }

  private codigoEtapaArveja(etapa?: string): string | undefined {
    const value = String(etapa || '').trim().toUpperCase();
    if (value.startsWith('MF')) return 'MF';
    if (value.startsWith('R3')) return 'R3';
    if (value.startsWith('R1')) return 'R1';
    if (value.startsWith('E')) return 'E';
    if (value.startsWith('S')) return 'S';
    return undefined;
  }

  private getEtapasDisponibles(
    cultivo: string,
    semilla?: ISemilla,
    etapasCrono?: Record<string, number | string>
  ): Record<string, number> {
    if (this.plantacionJoven && esCultivoPerenne(cultivo)) {
      this.fuenteFenologia = 'base';
      this.fuenteTexto = 'plantacion joven';
      const etapasJuveniles = semilla?.fenologiaReferencia?.etapasJuveniles;
      if (etapasJuveniles && Object.keys(etapasJuveniles).length) {
        return this.normalizarEtapas(etapasJuveniles);
      }
      const referenciaJoven = getFenologiaJuvenilPerenne(cultivo);
      if (referenciaJoven?.etapas.length) {
        return referenciaJoven.etapas.reduce<Record<string, number>>((acc, etapa) => {
          acc[etapa.nombre] = etapa.dia;
          return acc;
        }, {});
      }
    }

    if (etapasCrono && Object.keys(etapasCrono).length) {
      this.fuenteFenologia = 'crono';
      this.fuenteTexto = 'crono cargado';
      return this.normalizarEtapas(etapasCrono);
    }

    const etapasSemilla = semilla?.fenologiaReferencia?.etapas;
    if (etapasSemilla && Object.keys(etapasSemilla).length) {
      this.fuenteFenologia = 'semilla';
      this.fuenteTexto = 'referencia de semilla';
      return this.normalizarEtapas(etapasSemilla);
    }

    if (cultivo === 'Arveja' && semilla?.fenologiaReferencia?.unidadEtapas === 'grados_dia') {
      this.fuenteFenologia = 'semilla';
      this.fuenteTexto = 'referencia termica de semilla; calibracion pendiente';
      return {};
    }

    this.fuenteFenologia = 'base';
    this.fuenteTexto = 'base editable';
    const etapasPerennes = getEtapasPerennesReferencia(cultivo);
    if (etapasPerennes.length) {
      return etapasPerennes.reduce<Record<string, number>>((acc, etapa) => {
        acc[etapa.nombre] = etapa.dia;
        return acc;
      }, {});
    }
    return ETAPAS_BASE_POR_CULTIVO[cultivo] || {
      Inicio: 0,
      Desarrollo: 30,
      Monitoreo: 30,
      Cierre: 30,
    };
  }

  private normalizarEtapas(etapas: Record<string, number | string>): Record<string, number> {
    return Object.entries(etapas).reduce<Record<string, number>>((acc, [key, value]) => {
      const numero = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
      acc[key] = Number.isFinite(numero) ? numero : 0;
      return acc;
    }, {});
  }

  private normalizarCultivo(cultivo: string): string {
    if (cultivo === 'Maiz') {
      return 'maiz';
    }
    if (cultivo === 'Soja') {
      return 'soja';
    }
    return cultivo
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private canonicalCultivo(cultivo?: string): string {
    const normalizado = (cultivo || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    const cultivos: Record<string, string> = {
      trigo: 'Trigo',
      soja: 'Soja',
      maiz: 'Maiz',
      cebada: 'Cebada',
      arveja: 'Arveja',
      papa: 'Papa',
      vid: 'Vid',
      peral: 'Peral',
      pecan: 'Pecan',
      manzano: 'Manzano',
    };

    return cultivos[normalizado] || cultivo || 'Cultivo';
  }

  private crearEtapasGenericas(etapas?: Record<string, number>): { nombres: string[]; claves: string[] } {
    const claves = Object.keys(etapas || {});
    return {
      claves,
      nombres: claves.map((key) => this.formatearNombreEtapa(key)),
    };
  }

  private crearTimelinePerenne(cultivo: string, etapasDisponibles: Record<string, number>): void {
    const etapas = this.normalizarEtapasPerenne(etapasDisponibles);
    if (!etapas.length) {
      this.etapas = [];
      this.etapaActual = undefined;
      this.progreso = 0;
      return;
    }

    const inicioCampania = this.getInicioCampaniaPerenne(cultivo);
    const hoy = new Date();
    const diaCampania = Math.max(
      0,
      Math.min(365, Math.floor((hoy.getTime() - inicioCampania.getTime()) / this.diaMs))
    );
    const etapasCiclo = [...etapas];
    const ultima = etapasCiclo[etapasCiclo.length - 1];
    if (ultima.dia < 355) {
      etapasCiclo.push({
        nombre: this.nombreReposoFinal(cultivo),
        dia: 365,
      });
    }

    const etapaActualNumero = this.getIndiceEtapaPerenne(etapasCiclo, diaCampania);
    this.progreso = this.limitar((diaCampania / 365) * 100);
    this.etapaActual = etapasCiclo[etapaActualNumero]?.nombre || etapasCiclo[0].nombre;
    this.campaniaTexto = `${inicioCampania.getFullYear()}/${inicioCampania.getFullYear() + 1}`;

    this.etapas = etapasCiclo.map((etapa, index) => {
      const fecha = new Date(inicioCampania);
      fecha.setDate(fecha.getDate() + etapa.dia);
      const anterior = etapasCiclo[index - 1];
      const periodoDias = index > 0 ? Math.max(1, etapa.dia - anterior.dia) : undefined;

      return {
        nombre: etapa.nombre,
        fecha,
        periodoDias,
        posicion: this.posicionPorDiaPerenne(etapa.dia),
        estado: index < etapaActualNumero ? 'done' : index === etapaActualNumero ? 'current' : 'pending',
      };
    });
  }

  private normalizarEtapasPerenne(etapas: Record<string, number>): Array<{ nombre: string; dia: number }> {
    const entries = Object.entries(etapas)
      .map(([nombre, valor]) => ({ nombre: this.formatearNombreEtapa(nombre), valor: Number(valor || 0) }))
      .filter((item) => Number.isFinite(item.valor));

    if (!entries.length) {
      return [];
    }

    const valores = entries.map((item) => item.valor);
    const sonOffsets = valores.every((valor, index) => index === 0 || valor >= valores[index - 1]);
    let acumulado = 0;

    return entries
      .map((item, index) => {
        if (sonOffsets) {
          return { nombre: item.nombre, dia: Math.max(0, Math.min(365, Math.round(item.valor))) };
        }
        acumulado += index === 0 ? 0 : Math.max(0, item.valor);
        return { nombre: item.nombre, dia: Math.max(0, Math.min(365, Math.round(acumulado))) };
      })
      .sort((a, b) => a.dia - b.dia);
  }

  private getInicioCampaniaPerenne(cultivo: string): Date {
    const hoy = new Date();
    const mesActual = hoy.getMonth() + 1;
    const year = mesActual >= 7 ? hoy.getFullYear() : hoy.getFullYear() - 1;
    const anchors: Record<string, { mes: number; dia: number }> = {
      Pecan: { mes: 7, dia: 1 },
      Vid: { mes: 7, dia: 1 },
      Manzano: { mes: 7, dia: 1 },
      Peral: { mes: 7, dia: 1 },
    };
    const anchor = anchors[cultivo] || { mes: 7, dia: 1 };
    return new Date(year, anchor.mes - 1, anchor.dia);
  }

  private getIndiceEtapaPerenne(etapas: Array<{ nombre: string; dia: number }>, diaCampania: number): number {
    let actual = 0;
    etapas.forEach((etapa, index) => {
      if (diaCampania >= etapa.dia) {
        actual = index;
      }
    });
    return actual;
  }

  private posicionPorDiaPerenne(dia: number): number {
    const margen = 1.5;
    const anchoUtil = 100 - margen * 2;
    return margen + (Math.max(0, Math.min(365, dia)) / 365) * anchoUtil;
  }

  private nombreReposoFinal(cultivo: string): string {
    if (cultivo === 'Pecan') {
      return 'Reposo / nueva campania';
    }
    return 'Reposo invernal';
  }

  private getEtapaGenericaPorFecha(fechaBase: Date, claves: string[], etapas?: Record<string, number>): number {
    if (!claves.length) return -1;
    const hoy = Date.now();
    const cursor = new Date(fechaBase);
    let actual = 0;

    claves.forEach((key, index) => {
      if (index > 0) {
        cursor.setDate(cursor.getDate() + this.getDuracionEtapa(etapas, key));
      }
      if (cursor.getTime() <= hoy) {
        actual = index;
      }
    });

    return actual;
  }

  private formatearNombreEtapa(key: string): string {
    return key.replace(/_/g, ' ');
  }

  private getDuracionEtapa(etapas: Record<string, number> | undefined, key: string): number {
    const duracion = Number(etapas?.[key] || 0);
    return Number.isFinite(duracion) ? duracion : 0;
  }

  private limitar(valor: number): number {
    return Math.max(0, Math.min(100, valor));
  }

  private posicionUniforme(index: number, total: number): number {
    if (total <= 1) {
      return 50;
    }
    const margen = 1.5;
    const anchoUtil = 100 - margen * 2;
    return margen + (index / (total - 1)) * anchoUtil;
  }

  private indiceEtapaActual(): number {
    return this.etapas.findIndex((etapa) => etapa.estado === 'current');
  }

  private normalizarFechaRegistro(value?: Date): Date {
    const fecha = value instanceof Date ? new Date(value) : value ? new Date(value) : new Date();
    const segura = Number.isNaN(fecha.getTime()) ? new Date() : fecha;
    segura.setHours(12, 0, 0, 0);
    return segura;
  }

  private getDiasDesdeFechaBase(fechaBase: string | Date | undefined, fecha: Date): number | undefined {
    if (!fechaBase) return undefined;
    const base = fechaBase instanceof Date ? fechaBase : new Date(fechaBase);
    if (Number.isNaN(base.getTime())) return undefined;
    return Math.max(0, Math.floor((fecha.getTime() - base.getTime()) / this.diaMs));
  }

  private getDiasDesdeInicioCampania(fecha: Date): number | undefined {
    if (!this.esPerenne) return undefined;
    const cultivo = this.canonicalCultivo(this.siembraActual?.semilla?.cultivo);
    const anchors: Record<string, { mes: number; dia: number }> = {
      Pecan: { mes: 7, dia: 1 },
      Vid: { mes: 7, dia: 1 },
      Manzano: { mes: 7, dia: 1 },
      Peral: { mes: 7, dia: 1 },
    };
    const anchor = anchors[cultivo] || { mes: 7, dia: 1 };
    const year = fecha.getMonth() + 1 >= anchor.mes ? fecha.getFullYear() : fecha.getFullYear() - 1;
    const inicio = new Date(year, anchor.mes - 1, anchor.dia);
    return Math.max(0, Math.floor((fecha.getTime() - inicio.getTime()) / this.diaMs));
  }

  private getFrioAcumuladoSnapshot(): IRegistroFenologico['frioAcumulado'] | undefined {
    const frio = (this.lote?.dispositivos || [])
      .map((dispositivo: any) => dispositivo?.frioAcumulado)
      .find(Boolean) as any;
    if (!frio) return undefined;
    return {
      fechaDesde: frio.fechaInicio,
      fechaHasta: frio.fechaUltimoCalculo,
      horasFrio: this.numeroSeguro(frio.horasFrio),
      horasFrioEfectivas: this.numeroSeguro(frio.horasFrioEfectivas),
      porcionesFrio: this.numeroSeguro(frio.porcionesFrio),
      fuente: frio.fuente || 'Sensor LoRa',
    };
  }

  private numeroSeguro(value: unknown): number | undefined {
    const numero = Number(value);
    return Number.isFinite(numero) ? numero : undefined;
  }

  ngOnDestroy(): void {}
}
