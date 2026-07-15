import { Injectable } from '@nestjs/common';
import {
  evaluarRoyaAmarillaElJarroudi2017,
  IContextoVentanaSanitariaTrigo,
  IHoraRoyaAmarilla,
  IPrediccion,
  IPrediccionEnfermedad,
  ISemilla,
  IVariablesRoyaAmarillaEstriada,
  ROYA_AMARILLA_COBERTURA_HORARIA_MINIMA,
  ROYA_AMARILLA_UMBRAL_FUERTE_PCT,
  ROYA_AMARILLA_UMBRAL_MUY_FUERTE_PCT,
  ROYA_AMARILLA_UMBRAL_TEMPRANO_PCT,
  TRIGO_MOTOR_SANITARIO_VERSION,
  calcularRoyaAnaranjadaTrigo2026,
  calcularRoyaAnaranjadaTrigo2026Crudo,
  resolverResistencia,
} from 'modelos/src';
import {
  camposClimaticosFaltantes,
  combinarCalidadDatos,
  metadataSanitariaTrigo,
} from './calidad';

const FUENTE_EL_JARROUDI =
  'El Jarroudi et al. 2017, Plant Disease 101(5):693-703, DOI 10.1094/PDIS-12-16-1766-RE';
const FUENTE_CONTRATO_SOMBRA =
  'Contrato sanitario trigo 2026: 5,15 + 0,72 GD + 0,48 DHR + 0,35 DL - 35,2 (1-I); sin fuente primaria identificada';

@Injectable()
export class RoyaAnaranjadaService {
  async predecir(
    semilla: ISemilla,
    climaDiario: {
      precip: number;
      Tmax: number;
      Tmin: number;
      hr: number;
      Tavg: number;
    },
    horasVentana10Dias: IHoraRoyaAmarilla[],
    prediccionAnterior?: IPrediccion,
    predecir?: boolean,
    contexto?: IContextoVentanaSanitariaTrigo,
  ): Promise<IPrediccionEnfermedad> {
    const contextoSeguro = contexto || {
      gddBase0DesdeSiembra: 0,
      coberturaGdd: 0,
      etapa: 0,
      fenologiaObservada: false,
    };
    const prediccionAnteriorEnfermedad = prediccionAnterior?.enfermedades.find(
      (item) =>
        (item.idEnfermedad === 'trigo.roya_anaranjada' ||
          item.enfermedad === 'Roya Anaranjada') &&
        item.modelo?.version === TRIGO_MOTOR_SANITARIO_VERSION,
    );
    const prevVariables = (prediccionAnteriorEnfermedad?.variables ||
      {}) as IVariablesRoyaAmarillaEstriada;
    const resistencia = resolverResistencia(
      semilla.resistencia,
      'trigo.roya_anaranjada',
    );
    const variables: IVariablesRoyaAmarillaEstriada = {
      ...prevVariables,
      GD: Math.max(0, Number(prevVariables.GD) || 0),
      DHR: Math.max(0, Number(prevVariables.DHR) || 0),
      DL: Math.max(0, Number(prevVariables.DL) || 0),
      GDDBase0Siembra: contextoSeguro.gddBase0DesdeSiembra,
      coberturaGdd: contextoSeguro.coberturaGdd,
      umbralInicioGdd: contextoSeguro.fenologiaObservada ? 800 : 850,
      inicioPorFenologiaObservada: contextoSeguro.fenologiaObservada ? 1 : 0,
      factorSusceptibilidad: resistencia.multiplicador,
      formulaVersion: TRIGO_MOTOR_SANITARIO_VERSION,
    };

    // La ecuacion recibida se conserva exactamente para comparacion y
    // migracion, pero nunca alimenta el resultado publicado ni una alerta.
    const faltantesContrato = camposClimaticosFaltantes(climaDiario, [
      'precip',
      'hr',
      'Tavg',
    ]);
    if (!faltantesContrato.length) {
      if (predecir) {
        if (
          climaDiario.hr > 60 &&
          climaDiario.Tavg >= 7 &&
          climaDiario.Tavg <= 14
        ) {
          variables.GD = +(
            Number(variables.GD || 0) + climaDiario.Tavg
          ).toFixed(2);
        }
        if (climaDiario.hr > 75 && climaDiario.precip <= 5) {
          variables.DHR = Number(variables.DHR || 0) + 1;
        }
        if (climaDiario.precip >= 0.1 && climaDiario.precip <= 2) {
          variables.DL = Number(variables.DL || 0) + 1;
        }
      } else {
        variables.GD = 0;
        variables.DHR = 0;
        variables.DL = 0;
      }
      variables.resultadoContractualCrudo =
        +calcularRoyaAnaranjadaTrigo2026Crudo(
          Number(variables.GD || 0),
          Number(variables.DHR || 0),
          Number(variables.DL || 0),
          resistencia.multiplicador,
        ).toFixed(4);
      variables.resultadoContractualLimitado = +calcularRoyaAnaranjadaTrigo2026(
        Number(variables.GD || 0),
        Number(variables.DHR || 0),
        Number(variables.DL || 0),
        resistencia.multiplicador,
      ).toFixed(2);
    }

    const ambiente = evaluarRoyaAmarillaElJarroudi2017(horasVentana10Dias);
    const nivelNumerico = {
      sin_datos: 0,
      sin_senal: 0,
      senal_temprana: 1,
      fuerte: 2,
      muy_fuerte: 3,
    }[ambiente.nivel];
    variables.horasEsperadas10d = ambiente.horasEsperadas;
    variables.horasValidas10d = ambiente.horasValidas;
    variables.coberturaHoraria10d = ambiente.cobertura;
    variables.horasFavorables10d = ambiente.horasFavorables;
    variables.rachasFavorables10d = ambiente.rachasFavorables;
    variables.rachaMaximaHoras = ambiente.rachaMaximaHoras;
    variables.frecuenciaAmbientalPct = ambiente.frecuenciaAmbientalPct;
    variables.umbralSenalTempranaPct = ROYA_AMARILLA_UMBRAL_TEMPRANO_PCT;
    variables.umbralFuertePct = ROYA_AMARILLA_UMBRAL_FUERTE_PCT;
    variables.umbralMuyFuertePct = ROYA_AMARILLA_UMBRAL_MUY_FUERTE_PCT;
    variables.nivelOportunidad = nivelNumerico;
    variables.prioridadInterna = +(
      ambiente.frecuenciaAmbientalPct * resistencia.multiplicador
    ).toFixed(2);

    const metadata = metadataSanitariaTrigo(resistencia, contextoSeguro, true);
    const calidadHoraria = {
      nivel: ambiente.calculable ? ('media' as const) : ('sin_datos' as const),
      fuente:
        contextoSeguro.calidadClima?.fuente === 'mixto'
          ? ('mixto' as const)
          : contextoSeguro.calidadClima?.fuente || ('desconocida' as const),
      cobertura: ambiente.cobertura,
      fallback: !ambiente.calculable,
      resumen: ambiente.calculable
        ? `Ventana movil de 10 dias con ${(ambiente.cobertura * 100).toFixed(0)}% de cobertura horaria; se informa oportunidad ambiental, no enfermedad.`
        : `Cobertura horaria insuficiente (${(ambiente.cobertura * 100).toFixed(0)}%; minimo ${(
            ROYA_AMARILLA_COBERTURA_HORARIA_MINIMA * 100
          ).toFixed(0)}%). No se calcula oportunidad ambiental.`,
      limitaciones: [
        'La ventana movil de diez dias es una adaptacion Chaman del periodo de diez dias publicado y requiere validacion regional argentina.',
        'El clima no confirma inoculo, infeccion, sintomas, incidencia ni severidad a campo.',
        `La ecuacion contractual se conserva solo en sombra (${FUENTE_CONTRATO_SOMBRA}).`,
        ...(faltantesContrato.length
          ? [
              `El contraste contractual no pudo actualizarse por datos diarios faltantes: ${faltantesContrato.join(', ')}.`,
            ]
          : []),
      ],
    };

    const calidadCombinada =
      combinarCalidadDatos(metadata.calidadDatos, calidadHoraria) ||
      calidadHoraria;
    // `calidadDatos` resume tambien catalogo y fenologia, pero la procedencia
    // meteorologica no debe perderse bajo la etiqueta generica "mixto" cuando
    // toda la ventana proviene de una unica fuente.
    if (
      contextoSeguro.calidadClima?.fuente &&
      contextoSeguro.calidadClima.fuente !== 'mixto'
    ) {
      calidadCombinada.fuente = contextoSeguro.calidadClima.fuente;
    }

    return {
      enfermedad: 'Roya Anaranjada',
      idEnfermedad: 'trigo.roya_anaranjada',
      // Frecuencia de horas ambientalmente favorables en 240 h. No es
      // probabilidad, incidencia ni severidad de enfermedad.
      resultado: ambiente.calculable ? ambiente.frecuenciaAmbientalPct : 0,
      estado: ambiente.calculable ? 'calculado' : 'sin_datos',
      resistenciaUsada: metadata.resistenciaUsada,
      calidadClima: metadata.calidadClima,
      calidadDatos: calidadCombinada,
      modelo: {
        id: 'trigo.roya_anaranjada',
        version: TRIGO_MOTOR_SANITARIO_VERSION,
        fuente: FUENTE_EL_JARROUDI,
        resolucion: 'horaria',
        validacion: 'experimental',
        alcance:
          'Oportunidad ambiental de infeccion de roya amarilla/estriada (Puccinia striiformis) en una ventana movil de 10 dias. Sin alerta, push, confirmacion automatica ni prescripcion.',
      },
      variables,
    };
  }
}
