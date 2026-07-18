import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { SiembraService } from '../../../../../auxiliares/http/siembra.service';
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
  IRegistroFenologico,
  IRespuestaAgrometeorologiaSiembra,
  ISemilla,
  ISiembra,
  TObjetivoBiofixFenologico,
  construirHitosFenologiaArveja,
  resolverFenologiaTermicaArveja,
} from 'modelos/src';
import {
  ETAPAS_CEBADA,
  ETAPAS_MAIZ,
  ETAPAS_SOJA,
  ETAPAS_TRIGO,
} from '../drawer-grafico-enfermedades/drawer-grafico-enfermedades.component';
import {
  phenologyCropArchitecture,
  phenologyGrowthPercent,
  PhenologyVisualPhase,
  phenologyVisualPhase,
  phenologyVisualPhaseLabel,
} from './phenology-visual';
import { PhenologyPlantComponent } from './phenology-plant.component';

interface FenologiaStage {
  nombre: string;
  codigo?: string;
  fecha?: Date;
  fechaFuente?: 'campo' | 'referencia';
  periodoDias?: number;
  posicion: number;
  estado: 'done' | 'current' | 'pending';
  umbralMinGdd?: number;
  umbralMaxGdd?: number;
  requiereCampo?: boolean;
}

interface EtapaTermicaAnual {
  clave: string;
  nombre: string;
  orden: number;
  inicioGdd: number;
  finGdd: number;
}

type FuenteFenologia = 'crono' | 'semilla' | 'base';
type FuenteEtapaActual = 'campo' | 'termico' | 'calendario';

interface RegistroFenologicoForm {
  fecha: Date;
  etapa: string;
  tipoEvento: 'observacion' | 'inicio_etapa' | 'biofix';
  objetivoBiofix: TObjetivoBiofixFenologico;
  escalaEtapa: string;
  codigoEtapa: string;
  coberturaObservadaPct?: number;
  confianza: 'alta' | 'media' | 'baja';
  observador: string;
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
  imports: [CommonModule, SharedModule, PhenologyPlantComponent],
  templateUrl: './card-etapas-fenologicas.component.html',
  styleUrl: './card-etapas-fenologicas.component.scss',
})
export class CardEtapasFenologicasComponent implements OnInit, OnChanges, OnDestroy {
  @Input() public lote?: IDetallesLote;
  @Input() public siembra?: ISiembra;
  @Output() public estadoFenologiaTermicaChange = new EventEmitter<IEstadoFenologiaArveja | undefined>();
  @Output() public siembraActualizada = new EventEmitter<ISiembra>();
  public etapaActual?: string;
  public etapaActualConfirmadaCampo = false;
  public cultivo?: string;
  public cultivoClass = 'cultivo-trigo';
  public progreso = 0;
  public etapas: FenologiaStage[] = [];
  public fuenteFenologia: FuenteFenologia = 'crono';
  public fuenteTexto = 'crono cargado';
  public fuenteEtapaActual: FuenteEtapaActual = 'calendario';
  public modeloTermicoAnualActivo = false;
  public esPerenne = false;
  public plantacionJoven = false;
  public edadPlantacionAnios?: number;
  public edadProductivaDesdeAnios?: number;
  public fuenteFenologiaJoven = '';
  public etiquetaImplantacion: 'Siembra' | 'Plantacion' = 'Siembra';
  public campaniaTexto = '';
  public fenologiaTermica?: IFenologiaReferencia;
  public estadoFenologiaTermica?: IEstadoFenologiaArveja;
  public cargandoFenologiaTermica = false;
  public errorFenologiaTermica = '';
  public detalleEtapasDialogVisible = false;
  public registroDialogVisible = false;
  public guardandoRegistro = false;
  public registroEditandoId?: string;
  public registroForm: RegistroFenologicoForm = {
    fecha: new Date(),
    etapa: '',
    tipoEvento: 'inicio_etapa',
    objetivoBiofix: 'anclaje_fenologico',
    escalaEtapa: '',
    codigoEtapa: '',
    coberturaObservadaPct: undefined,
    confianza: 'media',
    observador: '',
    observaciones: '',
  };
  public readonly confianzaFenologicaOptions = [
    { label: 'Alta', value: 'alta' },
    { label: 'Media', value: 'media' },
    { label: 'Baja', value: 'baja' },
  ];
  public snapshotAgromet?: IRespuestaAgrometeorologiaSiembra;
  public cargandoSnapshotAgromet = false;
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

  public get arquitecturaVisual() {
    return phenologyCropArchitecture(this.cultivo);
  }

  public faseVisual(etapa: FenologiaStage, index: number): PhenologyVisualPhase {
    return phenologyVisualPhase(etapa.nombre, index, this.etapas.length);
  }

  public faseVisualTexto(etapa: FenologiaStage, index: number): string {
    return phenologyVisualPhaseLabel(this.faseVisual(etapa, index));
  }

  public alturaVisual(etapa: FenologiaStage, index: number): number {
    return phenologyGrowthPercent(index, this.etapas.length, this.faseVisual(etapa, index));
  }

  public etiquetaVisualEtapa(etapa: FenologiaStage, index: number): string {
    const estado = etapa.estado === 'current' ? this.etiquetaEtapaActual : this.etapaEstadoTexto(etapa, index);
    return `${estado}: ${etapa.nombre}. ${this.faseVisualTexto(etapa, index)}.`;
  }

  public get etiquetaEtapaActual(): string {
    if (this.fuenteEtapaActual === 'campo') return 'Estadio confirmado en campo';
    if (this.fuenteEtapaActual === 'termico') return 'Estadio termico estimado';
    return 'Etapa proyectada por cronograma';
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
      String(a.fecha || '').localeCompare(String(b.fecha || ''))
    );
  }

  public get registrosFenologicosVigentes(): IRegistroFenologico[] {
    const reemplazados = new Set(
      this.registrosFenologicos.map((registro) => registro.reemplazaRegistroId).filter((id): id is string => !!id)
    );
    return this.registrosFenologicos.filter((registro) => !registro.id || !reemplazados.has(registro.id));
  }

  public get registrosTermicosFenologicos(): IRegistroFenologico[] {
    return [...this.registrosFenologicosVigentes]
      .filter((registro) => !!registro.frioAcumulado)
      .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
  }

  public valorRegistroTermico(
    registro: IRegistroFenologico,
    metrica: 'horasFrio' | 'unidadesFrioUtah' | 'porcionesFrio' | 'gradosDia',
    decimales = 1
  ): string {
    const valor = this.numeroSeguro(registro.frioAcumulado?.[metrica]);
    if (valor === undefined) return '-';
    const unidad =
      metrica === 'horasFrio'
        ? 'HF'
        : metrica === 'unidadesFrioUtah'
          ? 'UF'
          : metrica === 'porcionesFrio'
            ? 'CP'
            : 'GDD';
    return `${valor.toLocaleString('es-AR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimales,
    })} ${unidad}`;
  }

  public fuenteRegistroTermico(registro: IRegistroFenologico): string {
    const snapshot = registro.frioAcumulado;
    if (!snapshot) return 'Sin snapshot';
    if (snapshot.serieCampoPrioritaria) return 'Sensor de campo prioritario';
    const fuente = String(snapshot.fuenteTemperatura || snapshot.fuente || '')
      .replace(/_/g, ' ')
      .trim();
    return fuente || 'Motor agrometeorologico';
  }

  public estadoRegistroTermico(registro: IRegistroFenologico): string {
    const estado = registro.frioAcumulado?.estado;
    if (estado === 'completo') return 'Serie completa';
    if (estado === 'parcial') return 'Serie con brechas documentadas';
    return 'Acumulado pendiente de consolidar';
  }

  public get ultimoRegistroFenologico(): IRegistroFenologico | undefined {
    const vigentes = this.registrosFenologicosVigentes.filter(
      (registro) =>
        !this.campaniaTexto || !registro.campania || this.mismaCampania(registro.campania, this.campaniaTexto)
    );
    return vigentes[vigentes.length - 1];
  }

  public get etapaOptions(): Array<{ label: string; value: string }> {
    return this.etapasRegistroNombres.map((nombre) => ({ label: nombre, value: nombre }));
  }

  public get tipoEventoOptions(): Array<{
    label: string;
    value: RegistroFenologicoForm['tipoEvento'];
  }> {
    const options: Array<{
      label: string;
      value: RegistroFenologicoForm['tipoEvento'];
    }> = [
      { label: 'Inicio real de etapa', value: 'inicio_etapa' },
      { label: 'Observacion puntual', value: 'observacion' },
    ];
    if (this.permiteBiofixTermico) {
      options.push({
        label: 'Biofix termico de campo',
        value: 'biofix',
      });
    }
    return options;
  }

  public get permiteBiofixTermico(): boolean {
    const cultivo = this.canonicalCultivo(this.siembraActual?.semilla?.cultivo);
    return this.esPerenne || cultivo === 'Trigo' || cultivo === 'Cebada' || cultivo === 'Arveja';
  }

  public get objetivoBiofixOptions(): Array<{
    label: string;
    value: TObjetivoBiofixFenologico;
  }> {
    const base: Array<{
      label: string;
      value: TObjetivoBiofixFenologico;
    }> = [
      {
        label: 'Solo anclaje fenologico',
        value: 'anclaje_fenologico',
      },
    ];
    if (this.esPerenne) {
      return [
        ...base,
        {
          label: 'Inicio real de acumulacion de frio',
          value: 'inicio_acumulacion_frio',
        },
        {
          label: 'Fin real de acumulacion de frio',
          value: 'fin_acumulacion_frio',
        },
        {
          label: 'Inicio de forzado por calor',
          value: 'inicio_forzado',
        },
      ];
    }
    return [
      ...base,
      {
        label: 'Inicio de ventana de vernalizacion',
        value: 'inicio_vernalizacion',
      },
      {
        label: 'Fin de ventana de vernalizacion',
        value: 'fin_vernalizacion',
      },
      {
        label: 'Reinicio de GDD de la etapa',
        value: 'reinicio_gdd_etapa',
      },
    ];
  }

  public get fechaRegistroLabel(): string {
    return this.registroForm.tipoEvento === 'observacion'
      ? 'Fecha de observacion'
      : this.registroForm.tipoEvento === 'biofix'
        ? 'Fecha del biofix'
        : 'Fecha de inicio real';
  }

  public get explicacionTipoRegistro(): string {
    if (this.registroForm.tipoEvento === 'observacion') {
      return 'Confirma lo visto solamente en esa fecha; no congela la etapa para los dias siguientes.';
    }
    if (this.registroForm.tipoEvento === 'biofix') {
      switch (this.registroForm.objetivoBiofix) {
        case 'inicio_acumulacion_frio':
          return 'Marca el inicio biologico observado de la ventana de frio. Prevalece sobre cualquier fecha calendario.';
        case 'fin_acumulacion_frio':
          return 'Cierra la ventana biologica de frio sin modificar los registros anteriores.';
        case 'inicio_forzado':
          return 'Inicia los grados-dia de forzado desde una observacion real de campo.';
        case 'inicio_vernalizacion':
          return 'Abre la ventana fenologica de exposicion termica; no aplica horas de frio de frutales.';
        case 'fin_vernalizacion':
          return 'Cierra la ventana fenologica de exposicion termica en la fase observada.';
        case 'reinicio_gdd_etapa':
          return 'Reinicia el acumulado termico de la etapa sin borrar el GDD total del ciclo.';
        default:
          return 'Ancla la etapa observada sin activar automaticamente un modelo termico.';
      }
    }
    return 'Corrige la fecha real de inicio y reancla la proyeccion posterior sin borrar el historial.';
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
    if (this.snapshotAgromet?.series?.length) {
      const type = this.snapshotAgromet.dataSource.type;
      if (type === 'sensor') return 'Sensor de campo';
      if (type === 'station') return 'Central meteorologica asociada';
      if (type === 'mixed') return 'Sensor/central + Open-Meteo';
      if (type === 'open_meteo') return 'Open-Meteo automatico';
    }
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
    if (this.fuenteEtapaActual === 'termico' && this.gradosDiaAcumuladosFenologia !== undefined) {
      const etapas = this.getEtapasTermicasAnualesValidadas(this.siembraActual?.semilla);
      const actual = etapas[this.indiceEtapaActual()];
      if (actual) {
        const amplitud = Math.max(1, actual.finGdd - actual.inicioGdd);
        return this.limitar(((this.gradosDiaAcumuladosFenologia - actual.inicioGdd) / amplitud) * 100);
      }
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
    if (!this.esPerenne && this.fuenteEtapaActual === 'campo') {
      return `La etapa ${actual.nombre} fue confirmada en campo y prevalece sobre el modelo termico y el calendario. Las proyecciones se conservan unicamente como contraste auditable.`;
    }
    if (!this.esPerenne && this.fuenteEtapaActual === 'termico') {
      const gdd = this.gradosDiaAcumuladosFenologia;
      const parametros = this.siembraActual?.semilla?.parametrosAgrometeorologicos;
      return `Etapa resuelta por el motor fenologico canonico${
        gdd === undefined ? '' : ` con ${gdd.toFixed(1)} GDD acumulados`
      }, Tb ${parametros?.temperaturaBaseC ?? '-'} C y fuente climatica ${this.fuenteFenologiaTermicaTexto}. La etapa ya incorpora las compuertas validadas de vernalizacion, fotoperiodo, cobertura y continuidad; el GDD bruto y el crono quedan solo como contraste.`;
    }
    if (!this.esPerenne && this.fuenteEtapaActual === 'calendario') {
      return `La etapa ${actual.nombre} es una proyeccion del cronograma de referencia. No confirma el estado observado del cultivo; registrarla a campo antes de decisiones sanitarias.`;
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
      const fuente = this.fuenteFenologiaTermicaTexto;
      return gdd === undefined
        ? `Etapa inicial de referencia. Falta clima historico para calcular el avance termico.`
        : `Estimacion con ${gdd.toFixed(1)} GDD desde la siembra, Tb ${base ?? '-'} C, fuente ${fuente}. Confirmar visualmente antes de decisiones sanitarias.`;
    }
    if (this.esPerenne && this.etapaActualConfirmadaCampo) {
      return `El inicio de ${actual.nombre} fue confirmado en campo. La etapa queda vigente hasta registrar la siguiente; el calendario varietal y los grados-dia se conservan solo como contraste.`;
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
    const fuente =
      !this.esPerenne && this.fuenteEtapaActual === 'campo'
        ? 'registro de campo prioritario'
        : !this.esPerenne && this.fuenteEtapaActual === 'termico'
          ? 'modelo termico canonico validado'
          : this.fenologiaTermica
            ? this.estadoFenologiaTermica?.fuente === 'campo'
              ? 'registro de campo prioritario'
              : 'modelo termico auditable'
            : this.esPerenne && this.etapaActualConfirmadaCampo
              ? 'registro de campo prioritario'
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
    return this.edadPlantacionAnios === 1 ? '1 año' : `${this.edadPlantacionAnios} años`;
  }

  public get detalleEdadProductiva(): string {
    if (!this.plantacionJoven) return 'desde el inicio';
    if (!this.edadProductivaDesdeAnios) return 'entrada productiva por validar';
    return `productiva desde ${this.edadProductivaDesdeAnios} años`;
  }

  public get siguienteHitoTexto(): string {
    const proxima = this.proximaEtapaDetalle;
    if (!proxima) return 'Sin proximo hito';
    if (this.esPerenne && this.etapaActualConfirmadaCampo && !proxima.fecha) {
      return `${proxima.nombre}: confirmar en campo`;
    }
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
    if (this.esPerenne && this.etapaActualConfirmadaCampo) {
      if (etapa.estado === 'current') {
        return etapa.fechaFuente === 'campo'
          ? 'Inicio confirmado en campo; sin avance automatico por calendario'
          : 'Etapa confirmada en campo';
      }
      if (etapa.estado === 'pending' && !etapa.fecha) {
        return 'Proxima transicion pendiente de observacion a campo';
      }
    }
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
    return [...this.registrosFenologicosVigentes]
      .reverse()
      .find(
        (registro) =>
          (registro.etapa === nombre ||
            (this.cultivo === 'Arveja' && this.codigoEtapaArveja(registro.etapa) === this.codigoEtapaArveja(nombre))) &&
          (!this.campaniaTexto || !registro.campania || this.mismaCampania(registro.campania, this.campaniaTexto)) &&
          (registro.accion || 'inicio') === 'inicio'
      );
  }

  public textoBotonRegistro(etapa: FenologiaStage): string {
    return this.registroEtapa(etapa) ? 'Editar inicio' : 'Registrar inicio';
  }

  public abrirDetalleEtapas(): void {
    this.detalleEtapasDialogVisible = true;
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
    const etapaSeleccionada = this.etapas.find((item) => item.nombre === nombreEtapa);
    this.registroEditandoId = existente?.id;
    this.registroForm = {
      fecha: existente?.fecha ? new Date(existente.fecha) : etapa?.fecha ? new Date(etapa.fecha) : new Date(),
      etapa: existente?.etapa || nombreEtapa,
      tipoEvento:
        existente?.tipoEvento === 'observacion' || existente?.tipoEvento === 'biofix'
          ? existente.tipoEvento
          : 'inicio_etapa',
      objetivoBiofix:
        existente?.objetivosBiofix?.find((objetivo) => objetivo !== 'anclaje_fenologico') ||
        this.inferirObjetivoBiofix(nombreEtapa),
      escalaEtapa: existente?.escalaEtapa || '',
      codigoEtapa: existente?.codigoEtapa || etapaSeleccionada?.codigo || '',
      coberturaObservadaPct: existente?.coberturaObservadaPct,
      confianza: existente?.confianza || 'media',
      observador: existente?.observador || '',
      observaciones: existente?.observaciones || '',
    };
    this.detalleEtapasDialogVisible = false;
    this.registroDialogVisible = true;
    void this.cargarSnapshotAgromet();
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
    if (
      this.registroForm.coberturaObservadaPct !== undefined &&
      (!Number.isFinite(this.registroForm.coberturaObservadaPct) ||
        this.registroForm.coberturaObservadaPct < 0 ||
        this.registroForm.coberturaObservadaPct > 100)
    ) {
      this.helper.notifWarn('La cobertura observada debe estar entre 0 y 100%.');
      return;
    }

    const fechaRegistro = this.normalizarFechaRegistro(this.registroForm.fecha);
    const registro: IRegistroFenologico = {
      fecha: fechaRegistro.toISOString(),
      accion: this.registroForm.tipoEvento === 'observacion' ? 'observacion' : 'inicio',
      tipoEvento: this.registroForm.tipoEvento,
      fechaObservacion: new Date().toISOString(),
      fechaInicioEtapa: this.registroForm.tipoEvento === 'observacion' ? undefined : fechaRegistro.toISOString(),
      etapa: this.registroForm.etapa,
      escalaEtapa: this.registroForm.escalaEtapa?.trim() || undefined,
      codigoEtapa: this.registroForm.codigoEtapa?.trim() || undefined,
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
      coberturaObservadaPct: this.registroForm.coberturaObservadaPct,
      confianza: this.registroForm.confianza,
      observador: this.registroForm.observador?.trim() || undefined,
      reemplazaRegistroId: this.registroEditandoId,
      objetivosBiofix:
        this.registroForm.tipoEvento === 'biofix'
          ? [...new Set<TObjetivoBiofixFenologico>(['anclaje_fenologico', this.registroForm.objetivoBiofix])]
          : undefined,
      requerimientoFrio: siembra.semilla?.requerimientoFrio,
      fenologiaReferencia: siembra.semilla?.fenologiaReferencia,
      observaciones: this.registroForm.observaciones?.trim() || undefined,
    };

    try {
      this.guardandoRegistro = true;
      const actualizado = await this.siembraService.registrarEtapaFenologica(siembra._id, registro);
      this.siembra = actualizado;
      if (this.lote?.siembra) {
        this.lote.siembra = actualizado;
      }
      this.siembraActualizada.emit(actualizado);
      this.crearTimeline();
      this.registroDialogVisible = false;
      this.registroEditandoId = undefined;
      this.helper.notifSuccess('Etapa fenologica registrada.');
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.guardandoRegistro = false;
    }
  }

  constructor(
    public helper: HelperService,
    private siembraService: SiembraService
  ) {}

  ngOnInit(): void {
    this.crearTimeline();
    void this.cargarFenologiaTermicaCanonica();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lote'] || changes['siembra']) {
      this.crearTimeline();
      void this.cargarFenologiaTermicaCanonica();
    }
  }

  private crearTimeline(): void {
    const siembra = this.siembra || this.lote?.siembra;
    const crono = siembra?.crono;

    if (!siembra?.fechaSiembra || !siembra.semilla?.cultivo) {
      this.etapas = [];
      this.fenologiaTermica = undefined;
      this.etapaActual = undefined;
      this.etapaActualConfirmadaCampo = false;
      this.fuenteEtapaActual = 'calendario';
      this.modeloTermicoAnualActivo = false;
      this.progreso = 0;
      return;
    }

    const cultivo = this.canonicalCultivo(siembra.semilla.cultivo);
    const etapasCrono = crono?.etapas as Record<string, number | string> | undefined;
    const fechas: Array<Date | undefined> = [];
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
      this.edadProductivaDesdeAnios
    );
    this.fuenteFenologiaJoven = fenologiaJoven?.fuente || '';
    this.campaniaTexto = '';
    this.etapaActualConfirmadaCampo = false;
    this.fuenteEtapaActual = 'calendario';
    this.modeloTermicoAnualActivo = false;
    this.fenologiaTermica =
      siembra.semilla?.fenologiaReferencia?.unidadEtapas === 'grados_dia'
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
          etapaActualNumero = this.getEtapaGenericaPorFecha(
            fechaBase,
            ['Siembra', ...Object.keys(etapasDisponibles)],
            etapasDisponibles
          );
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
          etapaActualNumero = this.getEtapaGenericaPorFecha(
            fechaBase,
            ['Siembra', ...Object.keys(etapasDisponibles)],
            etapasDisponibles
          );
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
          etapaActualNumero = this.getEtapaGenericaPorFecha(
            fechaBase,
            ['Siembra', ...Object.keys(etapasDisponibles)],
            etapasDisponibles
          );
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
          etapaActualNumero = this.getEtapaGenericaPorFecha(
            fechaBase,
            ['Siembra', ...Object.keys(etapasDisponibles)],
            etapasDisponibles
          );
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

    const etapasCalendario = {
      nombres: [...etapasConfig.nombres],
      claves: [...etapasConfig.claves],
    };
    const etapaCalendarioNumero = etapaActualNumero;
    const etapaCanonica = this.getEtapaCanonicaActual();
    const etapasTermicas = this.getEtapasTermicasAnualesValidadas(siembra.semilla);
    const gddAcumulado = this.gradosDiaAcumuladosFenologia;
    const indiceCanonicoCalendario = etapaCanonica?.stage
      ? this.indiceEtapaPorNombre(etapasCalendario.nombres, etapaCanonica.stage)
      : -1;
    const indiceCanonicoTermico = etapaCanonica?.stage
      ? this.indiceEtapaPorNombre(
          etapasTermicas.map((etapa) => etapa.nombre),
          etapaCanonica.stage
        )
      : -1;
    let usandoEtapasTermicas =
      !!etapaCanonica &&
      indiceCanonicoTermico >= 0 &&
      (etapaCanonica.stageSource === 'gdd_validado' || indiceCanonicoCalendario < 0);

    if (usandoEtapasTermicas) {
      etapasConfig = {
        nombres: etapasTermicas.map((etapa) => etapa.nombre),
        claves: etapasTermicas.map((etapa) => etapa.clave),
      };
      etapaActualNumero = indiceCanonicoTermico;
    } else if (etapaCanonica && indiceCanonicoCalendario >= 0) {
      etapaActualNumero = indiceCanonicoCalendario;
    } else if (etapaCanonica) {
      etapasConfig = {
        nombres: [etapaCanonica.stage!],
        claves: [this.normalizarNombreEtapa(etapaCanonica.stage)],
      };
      etapaActualNumero = 0;
    }
    this.aplicarFuenteEtapaCanonica(etapaCanonica);

    let registroCampo = this.getRegistroAnualActual(etapasConfig.nombres, new Date());
    if (!registroCampo && usandoEtapasTermicas) {
      const registroCalendario = this.getRegistroAnualActual(etapasCalendario.nombres, new Date());
      if (registroCalendario) {
        etapasConfig = etapasCalendario;
        etapaActualNumero = registroCalendario.indiceEtapa;
        registroCampo = registroCalendario;
        usandoEtapasTermicas = false;
      }
    }

    if (registroCampo) {
      etapaActualNumero = registroCampo.indiceEtapa;
      this.etapaActualConfirmadaCampo = true;
      this.fuenteEtapaActual = 'campo';
      this.fuenteTexto = 'registro de campo prioritario; modelo termico y crono solo para contraste';
    } else if (!etapaCanonica) {
      etapaActualNumero = etapaCalendarioNumero;
      this.fuenteEtapaActual = 'calendario';
    }

    if (usandoEtapasTermicas) {
      etapasTermicas.forEach((etapa) => {
        fechas.push(this.fechaEtapaTermicaAnual(etapa.inicioGdd));
      });
      const objetivoCiclo =
        etapasTermicas[etapasTermicas.length - 1]?.finGdd || etapasTermicas[etapasTermicas.length - 1]?.inicioGdd;
      this.progreso =
        objetivoCiclo > 0 && gddAcumulado !== undefined ? this.limitar((gddAcumulado / objetivoCiclo) * 100) : 0;
    } else {
      const cursor = new Date(fechaBase);
      etapasConfig.nombres.forEach((_, index) => {
        const dias = index > 0 ? this.getDuracionEtapa(etapasDisponibles, etapasConfig.claves[index]) : 0;
        cursor.setDate(cursor.getDate() + dias);
        fechas.push(new Date(cursor));
      });
      const fechaInicio = fechas[0]?.getTime();
      const fechaFin = fechas[fechas.length - 1]?.getTime();
      const duracionTotal =
        fechaInicio !== undefined && fechaFin !== undefined ? Math.max(fechaFin - fechaInicio, 1) : 1;
      this.progreso = fechaInicio !== undefined ? this.limitar(((Date.now() - fechaInicio) / duracionTotal) * 100) : 0;
    }
    if (registroCampo) {
      this.progreso = this.limitar((etapaActualNumero / Math.max(1, etapasConfig.nombres.length - 1)) * 100);
    }
    this.etapaActual = registroCampo
      ? etapasConfig.nombres[etapaActualNumero]
      : etapaCanonica?.stage ||
        (etapaActualNumero > -1 ? etapasConfig.nombres[etapaActualNumero] : etapasConfig.nombres[0]);

    this.etapas = etapasConfig.nombres.map((nombre, index) => {
      const posicion = this.posicionUniforme(index, etapasConfig.nombres.length);
      const estado = index < etapaActualNumero ? 'done' : index === etapaActualNumero ? 'current' : 'pending';
      const registroEtapa = this.getRegistroAnualDeEtapa(nombre, new Date());
      const fecha = registroEtapa?.fecha || fechas[index];
      const fechaAnterior =
        index > 0
          ? this.getRegistroAnualDeEtapa(etapasConfig.nombres[index - 1], new Date())?.fecha || fechas[index - 1]
          : undefined;
      const periodoDias =
        index > 0 && fecha && fechaAnterior
          ? Math.max(1, Math.round((fecha.getTime() - fechaAnterior.getTime()) / this.diaMs))
          : undefined;

      return {
        nombre,
        fecha,
        fechaFuente: registroEtapa ? 'campo' : fecha ? 'referencia' : undefined,
        periodoDias,
        posicion,
        estado,
      };
    });
  }

  private async cargarFenologiaTermicaCanonica(): Promise<void> {
    const siembra = this.siembraActual;
    const cultivo = this.canonicalCultivo(siembra?.semilla?.cultivo);
    const referencia = siembra?.semilla?.fenologiaReferencia;
    const arvejaTermicaLegacy = cultivo === 'Arveja' && referencia?.unidadEtapas === 'grados_dia';
    const perfilTermicoCanonico =
      !esCultivoPerenne(cultivo) && this.getEtapasTermicasAnualesValidadas(siembra?.semilla).length > 0;
    if ((!arvejaTermicaLegacy && !perfilTermicoCanonico) || !siembra?.fechaSiembra || !siembra._id) {
      this.estadoFenologiaTermica = undefined;
      this.estadoFenologiaTermicaChange.emit(undefined);
      this.snapshotAgromet = undefined;
      this.errorFenologiaTermica = '';
      this.cargandoFenologiaTermica = false;
      this.ultimoKeyFenologiaTermica = '';
      return;
    }

    const key = [
      siembra._id,
      siembra.fechaSiembra,
      siembra.semilla?.variedad,
      referencia?.temperaturaBaseC,
      siembra.semilla?.parametrosAgrometeorologicos?.version,
      siembra.semilla?.parametrosAgrometeorologicos?.fuente,
    ].join('|');
    if (key === this.ultimoKeyFenologiaTermica && (this.cargandoFenologiaTermica || !!this.snapshotAgromet)) {
      return;
    }
    this.ultimoKeyFenologiaTermica = key;
    const solicitud = ++this.solicitudFenologiaTermica;

    this.cargandoFenologiaTermica = true;
    this.errorFenologiaTermica = '';
    if (arvejaTermicaLegacy) {
      this.crearTimelineTermicaArveja();
    }
    try {
      const data = await this.siembraService.agrometeorologia(siembra._id);
      if (solicitud !== this.solicitudFenologiaTermica) return;
      this.snapshotAgromet = data;
      if (cultivo !== 'Arveja') {
        this.estadoFenologiaTermica = undefined;
        this.estadoFenologiaTermicaChange.emit(undefined);
      }
    } catch (error: any) {
      if (solicitud !== this.solicitudFenologiaTermica) return;
      this.snapshotAgromet = undefined;
      this.errorFenologiaTermica =
        error?.error?.message ||
        error?.message ||
        'No se pudo obtener el motor agrometeorologico canonico para la fenologia.';
    } finally {
      if (solicitud === this.solicitudFenologiaTermica) {
        this.cargandoFenologiaTermica = false;
        if (arvejaTermicaLegacy && !perfilTermicoCanonico) {
          this.crearTimelineTermicaArveja();
        } else {
          this.crearTimeline();
        }
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
    let estado = resolverFenologiaTermicaArveja({
      referencia,
      gradosDiaAcumulados: this.gradosDiaAcumuladosFenologia,
      etapaCampo: ultimoCampo?.etapa,
    });
    const etapaCanonica = estado.fuente === 'campo' ? undefined : this.getEtapaCanonicaActual();
    const codigoCanonico = this.codigoEtapaArveja(etapaCanonica?.stage);
    const indiceCanonico = codigoCanonico ? estado.hitos.findIndex((hito) => hito.codigo === codigoCanonico) : -1;
    if (etapaCanonica && indiceCanonico >= 0) {
      const hitoCanonico = estado.hitos[indiceCanonico];
      estado = {
        ...estado,
        codigo: hitoCanonico.codigo,
        nombre: hitoCanonico.nombre,
        indice: indiceCanonico,
        fuente:
          etapaCanonica.stageSource === 'campo'
            ? 'campo'
            : etapaCanonica.stageSource === 'gdd_validado'
              ? 'termica'
              : 'implantacion',
        progresoEtapaPct: estado.indice === indiceCanonico ? estado.progresoEtapaPct : 0,
        advertencias:
          estado.indice === indiceCanonico
            ? estado.advertencias
            : [
                ...estado.advertencias,
                'La etapa visual usa la resolucion canonica del backend; el GDD local queda solo como contraste.',
              ],
      };
    }
    this.estadoFenologiaTermica = estado;
    this.estadoFenologiaTermicaChange.emit(estado);
    this.etapaActual = etapaCanonica?.stage || estado.nombre;
    this.etapaActualConfirmadaCampo = estado.fuente === 'campo';
    this.fuenteFenologia = 'semilla';
    if (etapaCanonica) {
      this.aplicarFuenteEtapaCanonica(etapaCanonica);
    } else {
      this.fuenteEtapaActual = estado.fuente === 'campo' ? 'campo' : 'termico';
      this.fuenteTexto = estado.fuente === 'campo' ? 'registro de campo prioritario' : 'referencia termica auditable';
    }

    const madurez = estado.hitos.find((hito) => hito.codigo === 'MF');
    const objetivoTotal =
      madurez?.umbralMinGdd !== undefined && madurez.umbralMaxGdd !== undefined
        ? (madurez.umbralMinGdd + madurez.umbralMaxGdd) / 2
        : undefined;
    this.progreso =
      objetivoTotal && estado.gradosDiaAcumulados !== undefined
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

  private fechaHitoTermicoArveja(min?: number, max?: number, codigo?: string): Date | undefined {
    const fechaSiembra = this.siembraActual?.fechaSiembra;
    if (codigo === 'S') return fechaSiembra ? new Date(fechaSiembra) : undefined;
    if (!Number.isFinite(min) || !Number.isFinite(max)) return undefined;
    const objetivo = (Number(min) + Number(max)) / 2;
    const desde = String(fechaSiembra || '').slice(0, 10);
    let acumulado = 0;
    for (const dia of this.serieGradosDiaFenologia) {
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
    const value = String(etapa || '')
      .trim()
      .toUpperCase();
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
    return (
      ETAPAS_BASE_POR_CULTIVO[cultivo] || {
        Inicio: 0,
        Desarrollo: 30,
        Monitoreo: 30,
        Cierre: 30,
      }
    );
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

  private getEtapasTermicasAnualesValidadas(semilla?: ISemilla): EtapaTermicaAnual[] {
    if (!semilla || esCultivoPerenne(semilla.cultivo)) return [];
    const parametros = semilla.parametrosAgrometeorologicos;
    const temperaturaBase = parametros?.temperaturaBaseC;
    const temperaturaSuperior = parametros?.temperaturaSuperiorC;
    if (
      parametros?.estado !== 'validado' ||
      parametros.metodoGdd !== 'promedio_limitado' ||
      parametros.semanticaGddPorEtapa !== 'rangos_acumulados_desde_inicio_termico' ||
      !String(parametros.fuente || '').trim() ||
      typeof temperaturaBase !== 'number' ||
      !Number.isFinite(temperaturaBase) ||
      typeof temperaturaSuperior !== 'number' ||
      !Number.isFinite(temperaturaSuperior) ||
      temperaturaSuperior <= temperaturaBase
    ) {
      return [];
    }

    const etapas = Object.entries(parametros.gddPorEtapa || {})
      .map(([clave, rango]) => {
        const orden = rango?.orden;
        const inicio =
          typeof rango?.min === 'number' && Number.isFinite(rango.min)
            ? rango.min
            : typeof rango?.objetivo === 'number' && Number.isFinite(rango.objetivo)
              ? rango.objetivo
              : Number.NaN;
        const fin =
          typeof rango?.max === 'number' && Number.isFinite(rango.max)
            ? rango.max
            : typeof rango?.objetivo === 'number' && Number.isFinite(rango.objetivo)
              ? rango.objetivo
              : inicio;
        return {
          clave,
          nombre: this.formatearNombreEtapa(clave),
          orden: typeof orden === 'number' && Number.isInteger(orden) ? orden : Number.NaN,
          inicioGdd: inicio,
          finGdd: fin,
        };
      })
      .filter(
        (etapa) =>
          Number.isFinite(etapa.orden) &&
          Number.isFinite(etapa.inicioGdd) &&
          Number.isFinite(etapa.finGdd) &&
          etapa.inicioGdd >= 0 &&
          etapa.finGdd >= etapa.inicioGdd
      )
      .sort((a, b) => a.orden - b.orden);

    if (
      !etapas.length ||
      etapas.length !== Object.keys(parametros.gddPorEtapa || {}).length ||
      new Set(etapas.map((etapa) => etapa.orden)).size !== etapas.length ||
      etapas.some(
        (etapa, index) =>
          index > 0 && (etapa.inicioGdd <= etapas[index - 1].inicioGdd || etapa.finGdd < etapas[index - 1].finGdd)
      )
    ) {
      return [];
    }
    return etapas;
  }

  private getEtapaCanonicaActual():
    | (IRespuestaAgrometeorologiaSiembra['series'][number] & {
        stage: string;
      })
    | undefined {
    const hoy = this.fechaClave(new Date());
    const candidatas = [...(this.snapshotAgromet?.series || [])]
      .filter(
        (
          dia
        ): dia is IRespuestaAgrometeorologiaSiembra['series'][number] & {
          stage: string;
        } => !!String(dia.stage || '').trim() && String(dia.date || '') <= hoy
      )
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!candidatas.length) return undefined;
    return (
      [...candidatas].reverse().find((dia) => dia.date === hoy) ||
      [...candidatas].reverse().find((dia) => !dia.isForecast) ||
      candidatas[candidatas.length - 1]
    );
  }

  private indiceEtapaPorNombre(etapas: string[], etapa?: string): number {
    const nombre = this.normalizarNombreEtapa(etapa);
    if (!nombre) return -1;
    return etapas.findIndex((candidata) => this.normalizarNombreEtapa(candidata) === nombre);
  }

  private aplicarFuenteEtapaCanonica(
    etapa?:
      | (IRespuestaAgrometeorologiaSiembra['series'][number] & {
          stage: string;
        })
      | undefined
  ): void {
    this.modeloTermicoAnualActivo = etapa?.stageSource === 'gdd_validado';
    if (!etapa) return;

    switch (etapa.stageSource) {
      case 'campo':
        this.etapaActualConfirmadaCampo = true;
        this.fuenteEtapaActual = 'campo';
        this.fuenteTexto = 'registro de campo canonico; modelos solo para contraste';
        return;
      case 'gdd_validado':
        this.fuenteFenologia = 'semilla';
        this.fuenteEtapaActual = 'termico';
        this.fuenteTexto = 'motor fenologico canonico con compuertas validadas';
        return;
      case 'cronograma_referencia':
        this.fuenteFenologia = 'crono';
        this.fuenteEtapaActual = 'calendario';
        this.fuenteTexto = 'cronograma de referencia del motor canonico';
        return;
      case 'rango_termico_referencia':
        this.fuenteFenologia = 'semilla';
        this.fuenteEtapaActual = 'calendario';
        this.fuenteTexto = 'rango termico de referencia del motor canonico';
        return;
      case 'seguimiento':
        this.fuenteFenologia = 'base';
        this.fuenteEtapaActual = 'calendario';
        this.fuenteTexto = 'seguimiento conservador del motor canonico';
        return;
      default:
        this.fuenteEtapaActual = 'calendario';
        this.fuenteTexto = 'etapa informada por el motor canonico; procedencia no disponible';
    }
  }

  private fechaEtapaTermicaAnual(umbralGdd: number): Date | undefined {
    const fila = [...(this.snapshotAgromet?.series || [])]
      .filter(
        (dia) => Number.isFinite(Number(dia.metrics.gddAccumulated)) && Number(dia.metrics.gddAccumulated) >= umbralGdd
      )
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    return fila?.date ? new Date(`${fila.date}T12:00:00`) : undefined;
  }

  private getRegistroAnualActual(
    nombresEtapas: string[],
    fecha: Date
  ):
    | {
        registro: IRegistroFenologico;
        fecha: Date;
        indiceEtapa: number;
        persistente: boolean;
      }
    | undefined {
    const hasta = this.fechaClave(fecha);
    const inicioCiclo = String(this.siembraActual?.fechaSiembra || '').slice(0, 10);
    const candidatos = this.registrosFenologicosVigentes
      .map((registro) => {
        const fechaRegistro = this.fechaEfectivaRegistro(registro);
        const indiceEtapa = nombresEtapas.findIndex(
          (etapa) => this.normalizarNombreEtapa(etapa) === this.normalizarNombreEtapa(registro.etapa)
        );
        return {
          registro,
          fecha: fechaRegistro,
          fechaClave: fechaRegistro ? this.fechaClave(fechaRegistro) : '',
          indiceEtapa,
          persistente: registro.tipoEvento !== 'observacion' && registro.accion !== 'observacion',
        };
      })
      .filter(
        (item) =>
          !!item.fecha &&
          item.indiceEtapa >= 0 &&
          item.fechaClave <= hasta &&
          (!inicioCiclo || item.fechaClave >= inicioCiclo)
      )
      .sort((a, b) => a.fechaClave.localeCompare(b.fechaClave));
    const observacionHoy = [...candidatos].reverse().find((item) => !item.persistente && item.fechaClave === hasta);
    const seleccionado = observacionHoy || [...candidatos].reverse().find((item) => item.persistente);
    if (!seleccionado?.fecha) return undefined;
    return {
      registro: seleccionado.registro,
      fecha: seleccionado.fecha,
      indiceEtapa: seleccionado.indiceEtapa,
      persistente: seleccionado.persistente,
    };
  }

  private getRegistroAnualDeEtapa(
    etapa: string,
    fecha: Date
  ): { registro: IRegistroFenologico; fecha: Date } | undefined {
    const hasta = this.fechaClave(fecha);
    const inicioCiclo = String(this.siembraActual?.fechaSiembra || '').slice(0, 10);
    const encontrado = [...this.registrosFenologicosVigentes].reverse().find((registro) => {
      if (
        registro.tipoEvento === 'observacion' ||
        registro.accion === 'observacion' ||
        this.normalizarNombreEtapa(registro.etapa) !== this.normalizarNombreEtapa(etapa)
      ) {
        return false;
      }
      const fechaRegistro = this.fechaEfectivaRegistro(registro);
      if (!fechaRegistro) return false;
      const clave = this.fechaClave(fechaRegistro);
      return clave <= hasta && (!inicioCiclo || clave >= inicioCiclo);
    });
    const fechaRegistro = encontrado ? this.fechaEfectivaRegistro(encontrado) : undefined;
    return encontrado && fechaRegistro ? { registro: encontrado, fecha: fechaRegistro } : undefined;
  }

  private crearTimelinePerenne(cultivo: string, etapasDisponibles: Record<string, number>): void {
    const etapas = this.normalizarEtapasPerenne(etapasDisponibles);
    if (!etapas.length) {
      this.etapas = [];
      this.etapaActual = undefined;
      this.etapaActualConfirmadaCampo = false;
      this.progreso = 0;
      return;
    }

    const inicioCampania = this.getInicioCampaniaPerenne(cultivo);
    const hoy = new Date();
    const diaCampania = Math.max(0, Math.min(365, Math.floor((hoy.getTime() - inicioCampania.getTime()) / this.diaMs)));
    const etapasCiclo = [...etapas];
    const ultima = etapasCiclo[etapasCiclo.length - 1];
    if (ultima.dia < 355) {
      etapasCiclo.push({
        nombre: this.nombreReposoFinal(cultivo),
        dia: 365,
      });
    }

    const etapaReferenciaNumero = this.getIndiceEtapaPerenne(etapasCiclo, diaCampania);
    this.campaniaTexto = `${inicioCampania.getFullYear()}/${inicioCampania.getFullYear() + 1}`;
    const registroCampo = this.getRegistroPerenneActual(etapasCiclo, hoy);
    const etapaActualNumero = registroCampo?.indiceEtapa ?? etapaReferenciaNumero;
    this.etapaActualConfirmadaCampo = !!registroCampo;
    this.progreso = registroCampo
      ? this.limitar((etapaActualNumero / Math.max(1, etapasCiclo.length - 1)) * 100)
      : this.limitar((diaCampania / 365) * 100);
    this.etapaActual = etapasCiclo[etapaActualNumero]?.nombre || etapasCiclo[0].nombre;
    if (registroCampo) {
      this.fuenteTexto = 'registro de campo prioritario; referencia varietal solo para contraste';
    }

    this.etapas = etapasCiclo.map((etapa, index) => {
      const registroEtapa = this.getRegistroPerenneDeEtapa(etapa.nombre, hoy);
      const fechaReferencia = new Date(inicioCampania);
      fechaReferencia.setDate(fechaReferencia.getDate() + etapa.dia);
      const bloquearProyeccionFutura =
        !!registroCampo && registroCampo.persistente && index > etapaActualNumero && !registroEtapa;
      const fecha = registroEtapa?.fecha || (bloquearProyeccionFutura ? undefined : fechaReferencia);
      const anterior = etapasCiclo[index - 1];
      const periodoDias = index > 0 ? Math.max(1, etapa.dia - anterior.dia) : undefined;

      return {
        nombre: etapa.nombre,
        fecha,
        fechaFuente: registroEtapa ? 'campo' : fecha ? 'referencia' : undefined,
        periodoDias,
        posicion: this.posicionPorDiaPerenne(etapa.dia),
        estado: index < etapaActualNumero ? 'done' : index === etapaActualNumero ? 'current' : 'pending',
        requiereCampo: bloquearProyeccionFutura,
      };
    });
  }

  private getRegistroPerenneActual(
    etapas: Array<{ nombre: string; dia: number }>,
    fecha: Date
  ):
    | {
        registro: IRegistroFenologico;
        fecha: Date;
        indiceEtapa: number;
        persistente: boolean;
      }
    | undefined {
    const hasta = this.fechaClave(fecha);
    const candidatos = this.registrosFenologicosVigentes
      .map((registro) => {
        const fechaRegistro = this.fechaEfectivaRegistro(registro);
        const indiceEtapa = etapas.findIndex(
          (etapa) => this.normalizarNombreEtapa(etapa.nombre) === this.normalizarNombreEtapa(registro.etapa)
        );
        return {
          registro,
          fecha: fechaRegistro,
          fechaClave: fechaRegistro ? this.fechaClave(fechaRegistro) : '',
          indiceEtapa,
          persistente: registro.tipoEvento !== 'observacion' && registro.accion !== 'observacion',
        };
      })
      .filter(
        (item) =>
          !!item.fecha &&
          item.indiceEtapa >= 0 &&
          item.fechaClave <= hasta &&
          (!this.campaniaTexto ||
            !item.registro.campania ||
            this.mismaCampania(item.registro.campania, this.campaniaTexto))
      )
      .sort((a, b) => a.fechaClave.localeCompare(b.fechaClave));
    const observacionHoy = [...candidatos].reverse().find((item) => !item.persistente && item.fechaClave === hasta);
    const seleccionado = observacionHoy || [...candidatos].reverse().find((item) => item.persistente);
    if (!seleccionado?.fecha) return undefined;
    return {
      registro: seleccionado.registro,
      fecha: seleccionado.fecha,
      indiceEtapa: seleccionado.indiceEtapa,
      persistente: seleccionado.persistente,
    };
  }

  private getRegistroPerenneDeEtapa(
    etapa: string,
    fecha: Date
  ): { registro: IRegistroFenologico; fecha: Date } | undefined {
    const hasta = this.fechaClave(fecha);
    const encontrado = [...this.registrosFenologicosVigentes].reverse().find((registro) => {
      if (registro.tipoEvento === 'observacion' || registro.accion === 'observacion') {
        return false;
      }
      if (this.normalizarNombreEtapa(registro.etapa) !== this.normalizarNombreEtapa(etapa)) {
        return false;
      }
      if (this.campaniaTexto && registro.campania && !this.mismaCampania(registro.campania, this.campaniaTexto)) {
        return false;
      }
      const fechaRegistro = this.fechaEfectivaRegistro(registro);
      return !!fechaRegistro && this.fechaClave(fechaRegistro) <= hasta;
    });
    const fechaRegistro = encontrado ? this.fechaEfectivaRegistro(encontrado) : undefined;
    return encontrado && fechaRegistro ? { registro: encontrado, fecha: fechaRegistro } : undefined;
  }

  private fechaEfectivaRegistro(registro: IRegistroFenologico): Date | undefined {
    const value =
      registro.tipoEvento === 'observacion' || registro.accion === 'observacion'
        ? registro.fecha || registro.fechaObservacion
        : registro.fechaInicioEtapa || registro.fecha || registro.fechaObservacion;
    if (!value) return undefined;
    const fecha = new Date(value);
    return Number.isNaN(fecha.getTime()) ? undefined : fecha;
  }

  private fechaClave(fecha: Date): string {
    return [
      fecha.getFullYear(),
      String(fecha.getMonth() + 1).padStart(2, '0'),
      String(fecha.getDate()).padStart(2, '0'),
    ].join('-');
  }

  private normalizarNombreEtapa(value?: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
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

  private inferirObjetivoBiofix(etapa: string): TObjetivoBiofixFenologico {
    const normalizada = this.normalizarNombreEtapa(etapa);
    const legible = normalizada.replace(/_/g, ' ');
    if (this.esPerenne) {
      if (/dormancia|reposo|caida de hoja|caida de hojas/.test(legible)) {
        return 'inicio_acumulacion_frio';
      }
      if (/brotacion|yema hinchada|desborre/.test(legible)) {
        return 'inicio_forzado';
      }
      return 'anclaje_fenologico';
    }
    if (/germinacion|emergencia/.test(legible)) {
      return 'inicio_vernalizacion';
    }
    if (/iniciacion floral|espiguilla terminal/.test(legible)) {
      return 'fin_vernalizacion';
    }
    return 'reinicio_gdd_etapa';
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

  private mismaCampania(left?: string, right?: string): boolean {
    const normalizar = (value?: string) =>
      String(value || '')
        .trim()
        .replace(/[-_]/g, '/')
        .replace(/\s+/g, '');
    return normalizar(left) === normalizar(right);
  }

  private async cargarSnapshotAgromet(): Promise<void> {
    const id = this.siembraActual?._id;
    if (!id) {
      this.snapshotAgromet = undefined;
      return;
    }
    try {
      this.cargandoSnapshotAgromet = true;
      this.snapshotAgromet = await this.siembraService.agrometeorologia(id);
    } catch {
      this.snapshotAgromet = undefined;
    } finally {
      this.cargandoSnapshotAgromet = false;
      if (this.canonicalCultivo(this.siembraActual?.semilla?.cultivo) === 'Arveja') {
        this.crearTimelineTermicaArveja();
      } else {
        this.crearTimeline();
      }
    }
  }

  private get gradosDiaAcumuladosFenologia(): number | undefined {
    return this.numeroSeguro(this.snapshotAgromet?.summary?.gddAccumulated);
  }

  private get serieGradosDiaFenologia(): Array<{
    fecha: string;
    gradosDia?: number;
  }> {
    if (this.snapshotAgromet?.series?.length) {
      return this.snapshotAgromet.series.map((dia) => ({
        fecha: dia.date,
        gradosDia: this.numeroSeguro(dia.metrics.gddDaily),
      }));
    }
    return [];
  }

  private numeroSeguro(value: unknown): number | undefined {
    const numero = Number(value);
    return Number.isFinite(numero) ? numero : undefined;
  }

  ngOnDestroy(): void {}
}
