import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { IPrediccionEnfermedad, ISiembra, TEnfermedad } from 'modelos/src';
import { SiembraService } from '../../../../../auxiliares/http/siembra.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { DrawerGraficoEnfermedadesComponent } from '../drawer-grafico-enfermedades/drawer-grafico-enfermedades.component';

interface ProductoPrescripcion {
  grupo: string;
  activos: string;
  dosisHa: string;
}

interface PrescripcionEnfermedad {
  objetivo: string;
  momento: string;
  productos: ProductoPrescripcion[];
  nota: string;
}

interface VariableDetalle {
  key: string;
  label: string;
  value: string;
}

interface PrescripcionOption {
  label: string;
  value: string;
  producto: ProductoPrescripcion;
}

interface DiseaseInsight {
  enfermedad: TEnfermedad;
  prediccion?: IPrediccionEnfermedad;
  resultado: number;
  enVentanaFenologica: boolean;
  fill: number;
  severity: 'low' | 'medium' | 'high';
  periodo: string;
  sensibilidad: string;
  variables: string;
  variablesDetalladas: VariableDetalle[];
  estadoCalculo: string;
  estadoCorto: string;
  lecturaCorta: string;
  descripcion: string;
  calculo: string;
  prescripcion: PrescripcionEnfermedad;
  mostrarPrescripcion: boolean;
}

@Component({
  selector: 'app-card-enfermedades',
  imports: [CommonModule, SharedModule, DrawerGraficoEnfermedadesComponent],
  templateUrl: './card-enfermedades.component.html',
  styleUrl: './card-enfermedades.component.scss',
})
export class CardEnfermedadesComponent implements OnInit, OnDestroy {
  @Input() public siembra?: ISiembra;
  public verDrawerGraficoEnfermedades = false;
  public verDetalleEnfermedad = false;
  public actualizandoPrediccion = false;
  public enfermedadSeleccionada?: DiseaseInsight;
  public prescripcionSeleccionadaGrupo?: string;
  private readonly cultivosConMotorSanitario = new Set(['Trigo', 'Soja', 'Maiz', 'Cebada']);
  private readonly enfermedadesConfirmadas = new Set<TEnfermedad>();

  constructor(
    public helper: HelperService,
    private siembraService: SiembraService,
  ) {}

  async ngOnInit(): Promise<void> {}

  ngOnDestroy(): void {}

  public get tienePredicciones(): boolean {
    return !!this.siembra?.ultimaPrediccion?.enfermedades?.length;
  }

  public get tieneMotorSanitario(): boolean {
    const cultivo = this.siembra?.semilla?.cultivo;
    return !!cultivo && this.cultivosConMotorSanitario.has(cultivo);
  }

  public get etiquetaBotonActualizacion(): string {
    return this.tieneMotorSanitario ? 'Actualizar riesgo' : 'Motor en calibracion';
  }

  public get fechaUltimaPrediccion(): Date | undefined {
    const fecha = this.siembra?.ultimaPrediccion?.fechaPrediccion || this.siembra?.ultimaPrediccion?.fecha;
    return fecha ? new Date(fecha) : undefined;
  }

  public get opcionesPrescripcion(): PrescripcionOption[] {
    return (this.enfermedadSeleccionada?.prescripcion.productos || []).map((producto) => ({
      label: producto.grupo,
      value: producto.grupo,
      producto,
    }));
  }

  public get prescripcionSeleccionada(): ProductoPrescripcion | undefined {
    return this.opcionesPrescripcion.find((item) => item.value === this.prescripcionSeleccionadaGrupo)?.producto;
  }

  public async actualizarPrediccion(event?: Event): Promise<void> {
    event?.stopPropagation();
    if (!this.siembra?._id || this.actualizandoPrediccion || !this.tieneMotorSanitario) return;

    this.actualizandoPrediccion = true;
    try {
      const predicciones = await this.siembraService.generarPrediccionEnfermedades(this.siembra._id);
      const ultimaPrediccion = predicciones?.[predicciones.length - 1];
      if (ultimaPrediccion) {
        this.siembra.ultimaPrediccion = ultimaPrediccion;
        this.helper.notifSuccess('Prediccion de enfermedades actualizada');
      } else {
        this.helper.notifSuccess('No se generaron nuevas predicciones');
      }
    } catch (error) {
      this.helper.notifError(error);
    }
    this.actualizandoPrediccion = false;
  }

  public abrirDetalleEnfermedad(item: DiseaseInsight): void {
    this.enfermedadSeleccionada = item;
    this.verDetalleEnfermedad = true;
    this.sincronizarPrescripcionSeleccionada();
  }

  public cerrarDetalleEnfermedad(): void {
    this.verDetalleEnfermedad = false;
    this.enfermedadSeleccionada = undefined;
    this.prescripcionSeleccionadaGrupo = undefined;
  }

  public alternarConfirmacion(enfermedad: TEnfermedad): void {
    if (this.enfermedadesConfirmadas.has(enfermedad)) {
      this.enfermedadesConfirmadas.delete(enfermedad);
      this.prescripcionSeleccionadaGrupo = undefined;
      return;
    }
    this.enfermedadesConfirmadas.add(enfermedad);
    this.sincronizarPrescripcionSeleccionada();
  }

  public enfermedadConfirmada(enfermedad: TEnfermedad): boolean {
    return this.enfermedadesConfirmadas.has(enfermedad);
  }

  public abrirCurvas(): void {
    this.verDetalleEnfermedad = false;
    this.verDrawerGraficoEnfermedades = true;
  }

  public get enfermedadInsights(): DiseaseInsight[] {
    return this.enfermedadesEsperadas().map((enfermedad) => {
      const prediccion = this.prediccionPorEnfermedad(enfermedad);
      const resultado = prediccion?.resultado ?? 0;
      const enVentanaFenologica = this.estaEnVentanaFenologica(enfermedad);
      const estadoCalculo = this.estadoCalculo(prediccion, enfermedad);
      return {
        enfermedad,
        prediccion,
        resultado,
        enVentanaFenologica,
        fill: this.llenadoRiesgo(resultado, !!prediccion, enfermedad),
        severity: this.severidad(resultado, enfermedad),
        periodo: this.periodoSusceptible(enfermedad),
        sensibilidad: this.sensibilidadVarietal(enfermedad),
        variables: this.resumenVariables(prediccion, enfermedad),
        variablesDetalladas: this.variablesDetalladas(prediccion),
        estadoCalculo,
        estadoCorto: this.estadoCorto(prediccion, enfermedad, resultado),
        lecturaCorta: this.lecturaCorta(prediccion, enfermedad, estadoCalculo),
        descripcion: this.descripcionEnfermedad(enfermedad),
        calculo: this.calculoEnfermedad(enfermedad),
        prescripcion: this.prescripcionPorEnfermedad(enfermedad),
        mostrarPrescripcion: this.tieneMotorSanitario && enVentanaFenologica,
      };
    });
  }

  public get resumenGeneral(): string {
    const cultivo = this.siembra?.semilla?.cultivo || 'cultivo';
    const variedad = this.siembra?.semilla?.variedad || 'la variedad';
    if (!this.tieneMotorSanitario) {
      return `${variedad}: motor sanitario en calibracion para ${cultivo}.`;
    }
    if (!this.tienePredicciones) {
      const tieneVentanaActiva = this.enfermedadesEsperadas().some((enfermedad) =>
        this.estaEnVentanaFenologica(enfermedad),
      );
      if (!tieneVentanaActiva) {
        return `${variedad}: fuera de ventana sanitaria actual para ${cultivo}.`;
      }
      return `${variedad}: monitoreo activo para ${cultivo}.`;
    }
    const mayor = [...this.enfermedadInsights].sort((a, b) => b.resultado - a.resultado)[0];
    return mayor ? `Mayor atencion: ${mayor.enfermedad}` : `Monitoreo activo para ${cultivo}.`;
  }

  private sincronizarPrescripcionSeleccionada(): void {
    if (!this.enfermedadSeleccionada || !this.enfermedadConfirmada(this.enfermedadSeleccionada.enfermedad)) {
      this.prescripcionSeleccionadaGrupo = undefined;
      return;
    }

    const opciones = this.opcionesPrescripcion;
    if (!opciones.length) {
      this.prescripcionSeleccionadaGrupo = undefined;
      return;
    }

    const seleccionExiste = opciones.some((item) => item.value === this.prescripcionSeleccionadaGrupo);
    if (!seleccionExiste) {
      this.prescripcionSeleccionadaGrupo = opciones[0].value;
    }
  }

  private enfermedadesEsperadas(): TEnfermedad[] {
    const cultivo = this.siembra?.semilla?.cultivo;
    if (cultivo === 'Trigo') {
      return ['Mancha Amarilla', 'Roya de la Hoja', 'Roya Anaranjada', 'Mancha de la Hoja', 'Fusarium de la Espiga'];
    }
    if (cultivo === 'Cebada') {
      return ['Mancha en Red', 'Escaldadura de la Cebada', 'Roya de la Hoja de Cebada', 'Fusariosis de la Espiga de Cebada'];
    }
    if (cultivo === 'Soja') {
      return ['Fin de Ciclo'];
    }
    if (cultivo === 'Maiz') {
      return ['Roya del Maiz'];
    }
    if (cultivo === 'Vid') {
      return ['Oidio', 'Botritis', 'Mildiu'];
    }
    if (cultivo === 'Papa') {
      return ['Tizon Tardio', 'Tizon Temprano', 'Rhizoctonia'];
    }
    if (cultivo === 'Manzano') {
      return ['Sarna del Manzano', 'Oidio del Manzano', 'Fuego Bacteriano', 'Carpocapsa'];
    }
    if (cultivo === 'Peral') {
      return ['Sarna del Peral', 'Fuego Bacteriano', 'Psila del Peral'];
    }
    if (cultivo === 'Pecan') {
      return ['Sarna del Pecan', 'Bacteriosis del Pecan'];
    }
    return [];
  }

  private prediccionPorEnfermedad(enfermedad: TEnfermedad): IPrediccionEnfermedad | undefined {
    return this.siembra?.ultimaPrediccion?.enfermedades?.find((item) => item.enfermedad === enfermedad);
  }

  private umbralesRiesgo(enfermedad?: TEnfermedad): { medio: number; alto: number; escalaDirecta: boolean } {
    if (this.siembra?.semilla?.cultivo === 'Cebada') {
      return { medio: 35, alto: 60, escalaDirecta: true };
    }
    return { medio: 15, alto: 20, escalaDirecta: false };
  }

  private llenadoRiesgo(resultado: number, tienePrediccion: boolean, enfermedad?: TEnfermedad): number {
    if (!tienePrediccion) {
      return 0;
    }
    const umbrales = this.umbralesRiesgo(enfermedad);
    const valor = umbrales.escalaDirecta ? resultado : resultado * 4;
    return Math.max(8, Math.min(100, valor));
  }

  private severidad(resultado: number, enfermedad?: TEnfermedad): 'low' | 'medium' | 'high' {
    const umbrales = this.umbralesRiesgo(enfermedad);
    if (resultado >= umbrales.alto) {
      return 'high';
    }
    if (resultado >= umbrales.medio) {
      return 'medium';
    }
    return 'low';
  }

  private sensibilidadVarietal(enfermedad: TEnfermedad): string {
    const resistencia = this.siembra?.semilla?.resistencia?.find((item) => item.enfermedad === enfermedad);
    const multiplicador = resistencia?.multiplicador;
    if (multiplicador == null) {
      if (this.siembra?.semilla?.cultivo === 'Cebada') {
        return 'Sensibilidad base x1';
      }
      return 'Sin dato varietal';
    }
    if (multiplicador >= 1.15) {
      return `Susceptible x${multiplicador}`;
    }
    if (multiplicador <= 0.85) {
      return `Tolerante x${multiplicador}`;
    }
    return `Media x${multiplicador}`;
  }

  private periodoSusceptible(enfermedad: TEnfermedad): string {
    const periodos: Partial<Record<TEnfermedad, string>> = {
      'Mancha Amarilla': 'Puede presentarse desde emergencia hasta hoja bandera.',
      'Roya de la Hoja': 'Puede presentarse desde hoja bandera hasta llenado de granos.',
      'Mancha de la Hoja': 'Puede presentarse en vegetativo y reproductivo temprano.',
      'Fusarium de la Espiga': 'Ventana critica en espigazon y antesis.',
      'Roya del Tallo': 'Mayor riesgo en trigo tardio con cultivo activo.',
      'Roya Anaranjada': 'Mayor riesgo durante crecimiento activo.',
      'Mancha en Red': 'Mayor riesgo desde emergencia a espigazon con humedad, mojado y temperatura templada.',
      'Escaldadura de la Cebada': 'Riesgo temprano a hoja bandera con periodos frescos, lluvia y humedad persistente.',
      'Roya de la Hoja de Cebada': 'Desde primer nudo a llenado, especialmente con HR alta y temperaturas templadas.',
      'Fusariosis de la Espiga de Cebada': 'Ventana critica en espigazon, antesis y llenado temprano con lluvia y mojado.',
      'Fin de Ciclo': 'Mayor riesgo en floracion y llenado.',
      'Roya del Maiz': 'Puede presentarse desde vegetativo avanzado hasta llenado.',
      Oidio: 'Brotes activos, floracion y desarrollo de racimos con humedad favorable.',
      Botritis: 'Floracion, cierre de racimo y madurez con mojado o humedad alta.',
      Mildiu: 'Desde brotacion hasta canopia activa, especialmente despues de lluvias.',
      'Tizon Tardio': 'Desde emergencia hasta llenado de tuberculos con HR alta y mojado foliar.',
      'Tizon Temprano': 'Vegetativo avanzado y llenado, asociado a estres y humedad intermitente.',
      Rhizoctonia: 'Emergencia, tuberizacion y etapas tempranas con suelo frio-humedo.',
      'Sarna del Manzano': 'Brotacion, floracion, cuaje y fruto joven con mojado foliar.',
      'Oidio del Manzano': 'Brotacion y crecimiento de brotes con temperatura templada.',
      'Fuego Bacteriano': 'Floracion y brotes tiernos con temperatura templada/calida y humedad.',
      Carpocapsa: 'Cuaje, desarrollo de fruto y madurez; seguir vuelos/trampas y grados-dia.',
      'Sarna del Peral': 'Brotacion, floracion, cuaje y fruto joven con mojado foliar.',
      'Psila del Peral': 'Brotacion y crecimiento activo; seguir monitoreo de ninfas/adultos.',
      'Sarna del Pecan': 'Brotacion, cuaje y llenado de nuez con humedad alta.',
      'Bacteriosis del Pecan': 'Brotes y frutos jovenes con lluvia/viento y heridas.',
    };
    return periodos[enfermedad] || 'Periodo susceptible configurable por cultivo y zona.';
  }

  private estaEnVentanaFenologica(enfermedad: TEnfermedad): boolean {
    if (!this.tieneMotorSanitario) {
      return false;
    }
    const cultivo = this.siembra?.semilla?.cultivo;
    if (cultivo === 'Trigo') {
      const etapa = this.etapaTrigoActual();
      if (etapa == null) return true;
      if (enfermedad === 'Mancha Amarilla' || enfermedad === 'Mancha de la Hoja') {
        return etapa >= 1 && etapa <= 4;
      }
      if (enfermedad === 'Roya de la Hoja' || enfermedad === 'Roya Anaranjada') {
        return etapa >= 2 && etapa <= 6;
      }
      if (enfermedad === 'Fusarium de la Espiga') {
        return etapa >= 4 && etapa <= 6;
      }
    }
    if (cultivo === 'Cebada') {
      const etapa = this.etapaCebadaActual();
      if (etapa == null) return true;
      if (enfermedad === 'Mancha en Red') {
        return etapa >= 1 && etapa <= 5;
      }
      if (enfermedad === 'Escaldadura de la Cebada') {
        return etapa >= 1 && etapa <= 4;
      }
      if (enfermedad === 'Roya de la Hoja de Cebada') {
        return etapa >= 2 && etapa <= 6;
      }
      if (enfermedad === 'Fusariosis de la Espiga de Cebada') {
        return etapa >= 4 && etapa <= 6;
      }
    }
    if (cultivo === 'Soja') {
      const etapa = this.etapaSojaActual();
      if (!etapa) return true;
      return enfermedad === 'Fin de Ciclo' && (etapa === 'R3' || etapa === 'R5');
    }
    if (cultivo === 'Maiz') {
      const etapa = this.etapaMaizActual();
      if (etapa == null) return true;
      return enfermedad === 'Roya del Maiz' && (etapa === 1 || etapa === 2);
    }
    return false;
  }

  private descripcionEnfermedad(enfermedad: TEnfermedad): string {
    const textos: Partial<Record<TEnfermedad, string>> = {
      'Mancha Amarilla': 'Enfermedad foliar de trigo favorecida por lluvias, humedad alta y temperaturas templadas.',
      'Roya de la Hoja': 'Roya foliar de trigo que progresa con humedad sostenida y cultivo activo.',
      'Mancha de la Hoja': 'Complejo de manchas foliares que aumenta con humedad alta y precipitaciones relevantes.',
      'Fusarium de la Espiga': 'Enfermedad de espiga con ventana corta en espigazon/antesis y riesgo asociado a mojado floral.',
      'Roya Anaranjada': 'Roya de avance rapido asociada a temperatura, humedad y viento durante crecimiento activo.',
      'Mancha en Red': 'Enfermedad foliar de cebada favorecida por rastrojo infectado, humedad, lluvias y temperaturas templadas.',
      'Escaldadura de la Cebada': 'Enfermedad foliar de cebada asociada a clima fresco-humedo, salpicado de lluvia y canopeo persistente.',
      'Roya de la Hoja de Cebada': 'Roya foliar de cebada que progresa con cultivo activo, humedad relativa alta y temperaturas templadas.',
      'Fusariosis de la Espiga de Cebada': 'Riesgo sanitario de espiga ligado a lluvia/mojado durante espigazon y antesis.',
      'Fin de Ciclo': 'Complejo sanitario de soja asociado a lluvias acumuladas durante floracion y llenado.',
      'Roya del Maiz': 'Roya foliar de maiz favorecida por humedad muy alta y temperaturas templadas.',
    };
    return textos[enfermedad] || 'Riesgo sanitario configurado por cultivo, etapa fenologica y ambiente.';
  }

  private calculoEnfermedad(enfermedad: TEnfermedad): string {
    const calculos: Partial<Record<TEnfermedad, string>> = {
      'Mancha Amarilla': 'Severidad = (-2,25 + 1,62 x DPrHRT + 1,30 x DPr) x multiplicador varietal.',
      'Roya de la Hoja': 'Severidad = 4,42 + 0,61 x GD + 0,57 x DHR - 30,01 x multiplicador varietal.',
      'Mancha de la Hoja': 'Severidad = (-6,41 + 0,59 x DHR + 2,79 x DPr) x multiplicador varietal.',
      'Fusarium de la Espiga': 'Severidad = (20,37 + 8,63 x PMoj - 0,49 x GDN) x multiplicador varietal, dentro de la ventana de GDA.',
      'Roya Anaranjada': 'Severidad = (-63,11 + 0,96 x Tmin + 1,72 x Tmax + 3,72 x viento + 0,43 x HR) x multiplicador varietal.',
      'Mancha en Red': 'Cebada V2: respuesta horaria de temperatura y humedad, tasa diaria por perfil varietal y avance acumulado.',
      'Escaldadura de la Cebada': 'Cebada V2: riesgo de infeccion por temperatura fresca, mojado foliar, lluvia/salpicado y perfil varietal.',
      'Roya de la Hoja de Cebada': 'Cebada V2: severidad por grados dia, dias con HR sostenida y perfil de resistencia.',
      'Fusariosis de la Espiga de Cebada': 'Cebada V2: mojado de espiga, grados dia negativos/estresantes y perfil varietal durante ventana critica.',
      'Fin de Ciclo': 'Riesgo = (8 x Lt7 / 600) x multiplicador varietal, con Lt7 basado en dias y milimetros de lluvia mayor a 7 mm.',
      'Roya del Maiz': 'Severidad = 4,42 + 0,61 x GD + 0,57 x DHR - 30,01 x multiplicador varietal.',
    };
    return calculos[enfermedad] || 'Modelo en calibracion: cruza cultivo, etapa, clima y sensibilidad varietal.';
  }

  private variablesDetalladas(prediccion?: IPrediccionEnfermedad): VariableDetalle[] {
    if (!prediccion?.variables) {
      return [];
    }

    const labels: Record<string, string> = this.variableLabels();
    return Object.entries(prediccion.variables)
      .filter(([, value]) => value !== undefined && value !== null && Number.isFinite(Number(value)))
      .map(([key, value]) => ({
        key,
        label: labels[key] || key,
        value: Number(value).toFixed(1),
      }));
  }

  private resumenVariables(prediccion?: IPrediccionEnfermedad, enfermedad?: TEnfermedad): string {
    if (!this.tieneMotorSanitario) {
      return 'Sin calculo sanitario calibrado para este cultivo.';
    }
    if (!prediccion && enfermedad && !this.estaEnVentanaFenologica(enfermedad)) {
      return 'Fuera de ventana fenologica del cultivo.';
    }
    if (prediccion && !prediccion.variables) {
      return 'Riesgo calculado con clima diario y sensibilidad varietal.';
    }
    if (!prediccion?.variables) {
      return 'Actualizar riesgo para cruzar fenologia, humedad, lluvia y temperatura.';
    }
    const labels: Record<string, string> = this.variableLabels();
    return Object.entries(prediccion.variables)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${labels[key] || key}: ${Number(value).toFixed(1)}`)
      .slice(0, 3)
      .join(' - ');
  }

  private variableLabels(): Record<string, string> {
    return {
      DHR: 'HR sostenida',
      DPr: 'dias lluvia',
      DPrHRT: 'lluvia + HR + temp',
      PMoj: 'mojado',
      GDN: 'GDN',
      GDAcum: 'GDA',
      GD: 'GD',
      PtAc7: 'lluvia > 7',
      DPr7: 'dias > 7',
      Lt7: 'persistencia',
      Tmin: 'Tmin',
      Tmax: 'Tmax',
      viento: 'viento',
      HR: 'HR',
      diasFavorables: 'dias favorables',
      indiceAcumulado: 'indice acumulado',
      lluviaAcumulada: 'lluvia ponderada',
      humedadScore: 'humedad',
      temperaturaScore: 'temperatura',
      lluviaScore: 'lluvia',
      etapaScore: 'etapa',
      formulaVersion: 'version',
      fTemp: 'f temp',
      fHMF: 'f mojado',
      fPP: 'f lluvia',
      kVar: 'perfil varietal',
      ri: 'RI',
      horasMojado: 'horas mojado',
      lluviaDiaria: 'lluvia diaria',
      factorHumedad: 'factor HR',
      tasaDiaria: 'tasa diaria',
      severidadAcumulada: 'severidad acum.',
    };
  }


  private estadoCalculo(prediccion?: IPrediccionEnfermedad, enfermedad?: TEnfermedad): string {
    if (!this.tieneMotorSanitario) {
      return 'motor en calibracion';
    }
    if (!prediccion && enfermedad && !this.estaEnVentanaFenologica(enfermedad)) {
      return 'fuera de ventana fenologica';
    }
    if (!prediccion) {
      return 'listo para calcular';
    }
    return 'riesgo calculado';
  }

  private estadoCorto(prediccion: IPrediccionEnfermedad | undefined, enfermedad: TEnfermedad, resultado: number): string {
    if (!this.tieneMotorSanitario) {
      return 'En calibracion';
    }
    if (!prediccion && !this.estaEnVentanaFenologica(enfermedad)) {
      return 'Fuera de ventana';
    }
    if (!prediccion) {
      return 'Sin lectura';
    }
    const umbrales = this.umbralesRiesgo(enfermedad);
    if (resultado >= umbrales.alto) {
      return 'Riesgo alto';
    }
    if (resultado >= umbrales.medio) {
      return 'Riesgo medio';
    }
    return 'Riesgo bajo';
  }

  private lecturaCorta(
    prediccion: IPrediccionEnfermedad | undefined,
    enfermedad: TEnfermedad,
    estadoCalculo: string,
  ): string {
    if (!this.tieneMotorSanitario) {
      return 'Modelo reservado para calibracion del cultivo.';
    }
    if (!prediccion && !this.estaEnVentanaFenologica(enfermedad)) {
      return 'El cultivo no esta en la etapa sensible.';
    }
    if (!prediccion) {
      return 'Calculo disponible al actualizar riesgo.';
    }
    return `${estadoCalculo}. ${this.sensibilidadVarietal(enfermedad)}.`;
  }

  private etapaTrigoActual(): number | undefined {
    const etapas = this.siembra?.crono?.etapas as Record<string, number> | undefined;
    const dias = this.diasDesdeSiembra();
    if (!etapas || dias == null) return undefined;
    const etapa1 = etapas['R0_R1'] || 0;
    const etapa2 = etapa1 + (etapas['R1_R2'] || 0);
    const etapa3 = etapa2 + (etapas['R2_R3'] || 0);
    const etapa4 = etapa3 + (etapas['R3_R4'] || 0);
    const etapa5 = etapa4 + (etapas['R4_R5'] || 0);
    const etapa6 = etapa5 + (etapas['R5_R6'] || 0);
    const etapa7 = etapa6 + (etapas['R6_R7'] || 0);
    if (dias < etapa1) return 0;
    if (dias < etapa2) return 1;
    if (dias < etapa3) return 2;
    if (dias < etapa4) return 3;
    if (dias < etapa5) return 4;
    if (dias < etapa6) return 5;
    if (dias < etapa7) return 6;
    return 7;
  }

  private etapaCebadaActual(): number | undefined {
    const etapas = this.siembra?.crono?.etapas as Record<string, number> | undefined;
    const dias = this.diasDesdeSiembra();
    if (!etapas || dias == null) return undefined;
    const etapa1 = etapas['siembra_emergencia'] || 0;
    const etapa2 = etapa1 + (etapas['emergencia_primer_nudo'] || 0);
    const etapa3 = etapa2 + (etapas['primer_nudo_hoja_bandera'] || 0);
    const etapa4 = etapa3 + (etapas['hoja_bandera_espigazon'] || 0);
    const etapa5 = etapa4 + (etapas['espigazon_antesis'] || 0);
    const etapa6 = etapa5 + (etapas['antesis_llenado_granos'] || 0);
    const etapa7 = etapa6 + (etapas['llenado_granos_madurez_fisiologica'] || 0);
    if (dias < etapa1) return 0;
    if (dias < etapa2) return 1;
    if (dias < etapa3) return 2;
    if (dias < etapa4) return 3;
    if (dias < etapa5) return 4;
    if (dias < etapa6) return 5;
    if (dias < etapa7) return 6;
    return 7;
  }

  private etapaSojaActual(): 'Siembra' | 'Emergencia' | 'R1' | 'R3' | 'R5' | 'R7' | undefined {
    const etapas = this.siembra?.crono?.etapas as Record<string, number> | undefined;
    const dias = this.diasDesdeSiembra();
    if (!etapas || dias == null) return undefined;
    const emergencia = etapas['siembra_emergencia'] || 0;
    const r1 = emergencia + (etapas['emergencia_R1'] || 0);
    const r3 = r1 + (etapas['R1_R3'] || 0);
    const r5 = r3 + (etapas['R3_R5'] || 0);
    const r7 = r5 + (etapas['R5_R7'] || 0);
    if (dias < emergencia) return 'Siembra';
    if (dias < r1) return 'Emergencia';
    if (dias < r3) return 'R1';
    if (dias < r5) return 'R3';
    if (dias < r7) return 'R5';
    return 'R7';
  }

  private etapaMaizActual(): number | undefined {
    const etapas = this.siembra?.crono?.etapas as Record<string, number> | undefined;
    const dias = this.diasDesdeSiembra();
    if (!etapas || dias == null) return undefined;
    const emergencia = etapas['siembra_emergencia'] || 0;
    const floracion = emergencia + (etapas['emergencia_floracion'] || 0);
    const madurez = floracion + (etapas['floracion_madurez'] || 0);
    if (dias < emergencia) return 0;
    if (dias < floracion) return 1;
    if (dias < madurez) return 2;
    return 3;
  }

  private diasDesdeSiembra(): number | undefined {
    if (!this.siembra?.fechaSiembra) return undefined;
    const fechaSiembra = new Date(this.siembra.fechaSiembra);
    const hoy = new Date();
    return Math.floor((hoy.getTime() - fechaSiembra.getTime()) / (1000 * 60 * 60 * 24));
  }

  private prescripcionPorEnfermedad(enfermedad: TEnfermedad): PrescripcionEnfermedad {
    const base: Partial<Record<TEnfermedad, PrescripcionEnfermedad>> = {
      'Mancha Amarilla': {
        objetivo: 'Proteger area foliar y evitar avance hacia hoja bandera.',
        momento: 'Aplicar con umbral tecnico confirmado y condiciones predisponentes sostenidas.',
        productos: [
          {
            grupo: 'Triazol + estrobilurina',
            activos: 'Tebuconazole / Propiconazole + Azoxistrobin',
            dosisHa: '0,45 a 0,80 l/ha segun formulado',
          },
          {
            grupo: 'Mezcla reforzada',
            activos: 'Prothioconazole o Fluxapyroxad + QoI',
            dosisHa: 'Usar si hay presion alta o historial del lote',
          },
        ],
        nota: 'Cargar producto comercial desde la base local y validar marbete antes de recomendar.',
      },
      'Roya de la Hoja': {
        objetivo: 'Cortar ciclos de roya y sostener hoja bandera funcional.',
        momento: 'Priorizar desde hoja bandera cuando el riesgo sube con HR alta y temperatura templada.',
        productos: [
          {
            grupo: 'Triazol o mezcla doble',
            activos: 'Ciproconazole / Tebuconazole + estrobilurina',
            dosisHa: '0,35 a 0,70 l/ha segun formulado',
          },
          {
            grupo: 'Alternativa de rotacion',
            activos: 'Difenoconazole / Trifloxistrobin',
            dosisHa: 'Elegir por marbete y presion regional',
          },
        ],
        nota: 'La dosis final debe salir del producto seleccionado en la base de agroquimicos.',
      },
      'Mancha de la Hoja': {
        objetivo: 'Reducir manchas foliares tempranas y proteger canopeo.',
        momento: 'Monitorear desde vegetativo con humedad sostenida y lluvias repetidas.',
        productos: [
          {
            grupo: 'Triazol + carboxamida/estrobilurina',
            activos: 'Prothioconazole / Fluxapyroxad / Pyraclostrobin',
            dosisHa: '0,50 a 0,85 l/ha segun formulado',
          },
          {
            grupo: 'SDHI + QoI',
            activos: 'Fluxapyroxad / Benzovindifupyr + Azoxistrobina',
            dosisHa: 'Priorizar con manchas activas y humedad sostenida',
          },
        ],
        nota: 'Usar rotacion de modos de accion cuando haya aplicaciones sucesivas.',
      },
      'Fusarium de la Espiga': {
        objetivo: 'Reducir infeccion floral y riesgo de micotoxinas.',
        momento: 'Ventana muy corta: espigazon a antesis, con mojado y precipitaciones.',
        productos: [
          {
            grupo: 'Triazol especifico para espiga',
            activos: 'Metconazole / Prothioconazole / Tebuconazole',
            dosisHa: '0,60 a 1,00 l/ha segun formulado',
          },
          {
            grupo: 'Ventana critica',
            activos: 'No usar estrobilurina sola para control de fusarium',
            dosisHa: 'Aplicar con cobertura de espiga y pronostico predisponente',
          },
        ],
        nota: 'Exige ajuste fino por estado fenologico; validar cobertura y condicion de aplicacion.',
      },
      'Mancha en Red': {
        objetivo: 'Proteger area foliar de cebada y cortar avance hacia hoja bandera.',
        momento: 'Monitorear desde emergencia; intervenir con riesgo sostenido y sintomas/incidencia confirmada.',
        productos: [
          {
            grupo: 'DMI + QoI',
            activos: 'Triazol + estrobilurina registrados en cebada',
            dosisHa: 'Segun producto comercial, marbete y presion sanitaria',
          },
          {
            grupo: 'DMI + SDHI',
            activos: 'Prothioconazole / Fluxapyroxad u opciones registradas',
            dosisHa: 'Priorizar con historial del lote o presion alta',
          },
        ],
        nota: 'Validar registro para cebada cervecera, carencia y destino comercial antes de recomendar.',
      },
      'Escaldadura de la Cebada': {
        objetivo: 'Reducir infecciones foliares tempranas favorecidas por frio, humedad y salpicado.',
        momento: 'Aplicar solo con ambiente predisponente sostenido y sintomas activos en etapas sensibles.',
        productos: [
          {
            grupo: 'DMI + QoI/SDHI',
            activos: 'Triazol + estrobilurina o carboxamida registrada',
            dosisHa: 'Segun marbete y severidad confirmada',
          },
        ],
        nota: 'La decision debe integrar variedad, rastrojo, rotacion y validacion de campo.',
      },
      'Roya de la Hoja de Cebada': {
        objetivo: 'Sostener hojas funcionales y cortar ciclos de roya en crecimiento activo.',
        momento: 'Priorizar desde primer nudo a llenado cuando suben HR y temperatura templada.',
        productos: [
          {
            grupo: 'Triazol o mezcla doble',
            activos: 'Tebuconazole / Prothioconazole + QoI registrado',
            dosisHa: 'Segun marbete, presion regional y variedad',
          },
        ],
        nota: 'Rotar modos de accion y confirmar registro especifico para cebada.',
      },
      'Fusariosis de la Espiga de Cebada': {
        objetivo: 'Reducir infeccion de espiga y riesgo de calidad/micotoxinas.',
        momento: 'Ventana critica en espigazon y antesis con lluvia, HR alta o mojado prolongado.',
        productos: [
          {
            grupo: 'Triazol especifico espiga',
            activos: 'Prothioconazole / Metconazole / Tebuconazole registrados',
            dosisHa: 'Segun marbete y cobertura de espiga',
          },
        ],
        nota: 'No recomendar estrobilurina sola para fusariosis; validar destino cervecero y tolerancias.',
      },
      'Roya del Tallo': {
        objetivo: 'Frenar pustulas activas en tallo y hojas.',
        momento: 'Aplicar solo con deteccion o riesgo alto confirmado.',
        productos: [
          {
            grupo: 'Triazol + estrobilurina',
            activos: 'Tebuconazole / Azoxistrobin',
            dosisHa: 'Segun marbete del producto cargado',
          },
        ],
        nota: 'Base inicial pendiente de parametrizar por zona.',
      },
      'Roya Anaranjada': {
        objetivo: 'Proteger cultivo durante crecimiento activo.',
        momento: 'Usar cuando el monitoreo confirme incremento de riesgo.',
        productos: [
          {
            grupo: 'Triazol',
            activos: 'Ciproconazole / Tebuconazole',
            dosisHa: 'Segun marbete del producto cargado',
          },
        ],
        nota: 'Base inicial pendiente de parametrizar por cultivo.',
      },
      'Fin de Ciclo': {
        objetivo: 'Proteger area foliar en floracion y llenado.',
        momento: 'Aplicar con canopeo cerrado, HR alta y lluvias frecuentes.',
        productos: [
          {
            grupo: 'Triazol + estrobilurina/carboxamida',
            activos: 'Azoxistrobin / Ciproconazole / Benzovindiflupyr',
            dosisHa: '0,40 a 0,75 l/ha segun formulado',
          },
          {
            grupo: 'Mezcla triple',
            activos: 'DMI + QoI + SDHI segun presion sanitaria',
            dosisHa: 'Reservar para alto riesgo o historial sanitario',
          },
        ],
        nota: 'Ajustar por variedad, historial del lote y presion regional.',
      },
      'Roya del Maiz': {
        objetivo: 'Proteger hojas funcionales durante periodo reproductivo.',
        momento: 'Aplicar si el riesgo sube en vegetativo avanzado o prefloracion.',
        productos: [
          {
            grupo: 'Triazol + estrobilurina',
            activos: 'Tebuconazole / Azoxistrobin',
            dosisHa: '0,50 a 0,80 l/ha segun formulado',
          },
        ],
        nota: 'Confirmar compatibilidad del producto con maiz y estadio del cultivo.',
      },
      Oidio: {
        objetivo: 'Reducir infecciones en brotes, hojas y racimos susceptibles.',
        momento: 'Priorizar aplicaciones preventivas cuando el monitoreo y clima indiquen riesgo.',
        productos: [
          { grupo: 'Multisitio', activos: 'Azufre', dosisHa: 'Segun marbete, temperatura y formulado' },
          { grupo: 'DMI/QoI/SDHI', activos: 'Triazoles, estrobilurinas o carboxamidas registradas', dosisHa: 'Rotar modos de accion y validar etiqueta' },
        ],
        nota: 'Validar registro por cultivo, destino y restricciones de residuo antes de aplicar.',
      },
      Botritis: {
        objetivo: 'Proteger floracion/racimo y reducir infecciones latentes.',
        momento: 'Floracion, cierre de racimo y pre-cosecha si hay humedad sostenida.',
        productos: [
          { grupo: 'Botriticidas especificos', activos: 'Ciprodinil + Fludioxonil / Boscalid / Fenhexamid', dosisHa: 'Segun producto comercial y marbete' },
        ],
        nota: 'La cobertura y rotacion anti-resistencia son criticas.',
      },
      Mildiu: {
        objetivo: 'Prevenir infecciones despues de lluvias y mojado foliar.',
        momento: 'Canopia activa con lluvia o pronostico predisponente.',
        productos: [
          { grupo: 'Preventivos', activos: 'Cobre / Mancozeb', dosisHa: 'Segun marbete' },
          { grupo: 'Sistemicos especificos', activos: 'Metalaxil-M u otros oomyceticidas registrados', dosisHa: 'Usar en rotacion, no repetir sin criterio tecnico' },
        ],
        nota: 'Confirmar registro para vid y estrategia anti-resistencia.',
      },
      'Tizon Tardio': {
        objetivo: 'Proteger follaje y tuberculos contra Phytophthora infestans.',
        momento: 'Emergencia a llenado con HR alta, lluvia o mojado foliar.',
        productos: [
          { grupo: 'Preventivos', activos: 'Mancozeb / Cobre / Clorotalonil donde este registrado', dosisHa: 'Segun marbete' },
          { grupo: 'Especificos oomycetes', activos: 'Metalaxil-M / Cymoxanil / Mandipropamid registrados', dosisHa: 'Segun riesgo y etiqueta' },
        ],
        nota: 'No recomendar sin confirmar destino, carencia y registro vigente.',
      },
      'Tizon Temprano': {
        objetivo: 'Reducir avance de Alternaria en follaje activo.',
        momento: 'Vegetativo avanzado/llenado con estres y humedad favorable.',
        productos: [
          { grupo: 'DMI/QoI/SDHI', activos: 'Difenoconazole / Azoxistrobina / Boscalid registrados', dosisHa: 'Segun marbete' },
        ],
        nota: 'Combinar con manejo de estres y monitoreo de manchas activas.',
      },
      Rhizoctonia: {
        objetivo: 'Reducir dano temprano en brotes, estolones y tuberculos.',
        momento: 'Tratamiento/arranque y emergencia segun historial del lote.',
        productos: [
          { grupo: 'Tratamiento preventivo', activos: 'Flutolanil / Azoxistrobina u opciones registradas', dosisHa: 'Segun formulado y posicion de aplicacion' },
        ],
        nota: 'Depende mucho de semilla, suelo e historial; validar estrategia tecnica.',
      },
      'Sarna del Manzano': {
        objetivo: 'Proteger tejido verde y fruto joven durante infecciones primarias.',
        momento: 'Brotacion a cuaje con mojado foliar.',
        productos: [
          { grupo: 'Preventivos multisitio', activos: 'Captan / Mancozeb / Cobre segun ventana', dosisHa: 'Segun marbete' },
          { grupo: 'Curativos/mezclas', activos: 'Difenoconazole u otros DMI registrados', dosisHa: 'Rotar modos de accion' },
        ],
        nota: 'Ajustar por estadio, carencia y mercado destino.',
      },
      'Sarna del Peral': {
        objetivo: 'Proteger tejido verde y fruto joven durante mojados infectivos.',
        momento: 'Brotacion, floracion y cuaje con humedad alta.',
        productos: [
          { grupo: 'Preventivos multisitio', activos: 'Captan / Mancozeb / Cobre segun registro', dosisHa: 'Segun marbete' },
          { grupo: 'DMI', activos: 'Difenoconazole registrado', dosisHa: 'Segun etiqueta y riesgo' },
        ],
        nota: 'Validar sensibilidad varietal y registro para peral.',
      },
      'Sarna del Pecan': {
        objetivo: 'Proteger brotes, hojas y nuez joven en humedad alta.',
        momento: 'Brotacion a llenado de nuez con mojado prolongado.',
        productos: [
          { grupo: 'Preventivos/mezclas', activos: 'Cobre / DMI / QoI registrados para pecan', dosisHa: 'Segun marbete local' },
        ],
        nota: 'Base inicial: requiere validacion regional y de etiqueta.',
      },
      'Oidio del Manzano': {
        objetivo: 'Reducir infeccion en brotes y hojas nuevas.',
        momento: 'Brotacion y crecimiento activo con clima templado.',
        productos: [
          { grupo: 'Preventivos/DMI', activos: 'Azufre / DMI registrados', dosisHa: 'Segun marbete y temperatura' },
        ],
        nota: 'Evitar fitotoxicidad y rotar modos de accion.',
      },
      'Fuego Bacteriano': {
        objetivo: 'Reducir infeccion floral y avance bacteriano en brotes.',
        momento: 'Floracion con temperatura templada/calida y humedad.',
        productos: [
          { grupo: 'Bactericidas/preventivos', activos: 'Cobre u opciones registradas segun zona', dosisHa: 'Segun marbete' },
        ],
        nota: 'El manejo cultural y alerta temprana son tan importantes como la aplicacion.',
      },
      Carpocapsa: {
        objetivo: 'Proteger fruto segun vuelo y grados-dia.',
        momento: 'Aplicar por umbral/trampas/modelo, no por calendario fijo.',
        productos: [
          { grupo: 'Insecticidas especificos', activos: 'Clorantraniliprol / reguladores / opciones registradas', dosisHa: 'Segun marbete y momento de oviposicion' },
        ],
        nota: 'Es plaga sanitaria; validar monitoreo, carencia y mercado.',
      },
      'Psila del Peral': {
        objetivo: 'Reducir poblaciones de ninfas/adultos y dano por melaza.',
        momento: 'Intervenir por umbral de monitoreo y estado fenologico.',
        productos: [
          { grupo: 'Insecticidas/aceites registrados', activos: 'Aceites, reguladores u opciones registradas', dosisHa: 'Segun marbete' },
        ],
        nota: 'Integrar control biologico y evitar aplicaciones que disparen resurgencia.',
      },
      'Bacteriosis del Pecan': {
        objetivo: 'Reducir infeccion en brotes y frutos jovenes.',
        momento: 'Lluvias, viento/heridas y humedad alta.',
        productos: [
          { grupo: 'Preventivos', activos: 'Cobre u opciones registradas', dosisHa: 'Segun marbete' },
        ],
        nota: 'Base inicial pendiente de validacion regional.',
      },
    };

    return (
      base[enfermedad] || {
        objetivo: 'Monitorear riesgo sanitario y validar recomendacion tecnica.',
        momento: 'Aplicar solo con diagnostico, umbral y condiciones predisponentes confirmadas.',
        productos: [
          {
            grupo: 'Base local',
            activos: 'Seleccionar producto desde la base de agroquimicos validada',
            dosisHa: 'Segun marbete y criterio tecnico',
          },
        ],
        nota: 'Prescripcion orientativa: requiere validacion de etiqueta, cultivo, zona y asesor agronomico.',
      }
    );
  }
}
