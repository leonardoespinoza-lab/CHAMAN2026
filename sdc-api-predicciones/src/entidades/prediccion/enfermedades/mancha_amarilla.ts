import { Injectable } from '@nestjs/common';
import {
  IContextoVentanaSanitariaTrigo,
  IPrediccion,
  IPrediccionEnfermedad,
  ISemilla,
  IVariablesManchaAmarilla,
  TRIGO_MOTOR_SANITARIO_VERSION,
} from 'modelos/src';
import {
  calcularManchaAmarilla,
  calcularManchaAmarillaCrudo,
  resolverResistencia,
} from 'modelos/src';
import {
  camposClimaticosFaltantes,
  crearPrediccionSinDatos,
  metadataSanitariaTrigo,
} from './calidad';

@Injectable()
export class ManchaAmarillaService {
  async predecir(
    semilla: ISemilla,
    clima: {
      precip: number;
      hr: number;
      Tmax: number;
      Tmin: number;
    },
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
      (e) =>
        (e.idEnfermedad === 'trigo.mancha_amarilla' ||
          e.enfermedad === 'Mancha Amarilla') &&
        e.modelo?.version === TRIGO_MOTOR_SANITARIO_VERSION,
    );
    const anteriores = (prediccionAnteriorEnfermedad?.variables ||
      {}) as IVariablesManchaAmarilla;
    const resistencia = resolverResistencia(
      semilla.resistencia,
      'trigo.mancha_amarilla',
    );
    const variables: IVariablesManchaAmarilla = {
      ...anteriores,
      DPr: Math.max(0, Number(anteriores.DPr) || 0),
      DPrHRT: Math.max(0, Number(anteriores.DPrHRT) || 0),
      GDDBase0Siembra: contextoSeguro.gddBase0DesdeSiembra,
      coberturaGdd: contextoSeguro.coberturaGdd,
      umbralInicioGdd: contextoSeguro.fenologiaObservada ? 800 : 850,
      inicioPorFenologiaObservada: contextoSeguro.fenologiaObservada ? 1 : 0,
      factorSusceptibilidad: resistencia.multiplicador,
      formulaVersion: TRIGO_MOTOR_SANITARIO_VERSION,
    };
    const faltantes = camposClimaticosFaltantes(clima, [
      'precip',
      'hr',
      'Tmax',
      'Tmin',
    ]);
    if (faltantes.length) {
      return crearPrediccionSinDatos(
        'Mancha Amarilla',
        'trigo.mancha_amarilla',
        faltantes,
        'Modelo propietario Chaman 2026 / Mancha Amarilla',
        TRIGO_MOTOR_SANITARIO_VERSION,
        'operativo_provisional',
        variables,
      );
    }
    // Logger.log(
    //   `Prediccion de Mancha Amarilla fecha: ${fecha}, semilla: ${semilla}, clima: ${clima}, prediccionAnterior: ${prediccionAnteriorEnfermedad}`,
    // );
    if (clima.precip > 2) {
      variables.DPr = predecir ? variables.DPr + 1 : 0;
    }
    // Dias con precipitaciones > 1mm y HR >= 80% y temp max <= 32°C y temp min >= 8°C
    if (
      clima.precip > 1 &&
      clima.hr >= 80 &&
      clima.Tmax <= 32 &&
      clima.Tmin >= 8
    ) {
      variables.DPrHRT = predecir ? variables.DPrHRT + 1 : 0;
    }

    if (!predecir) {
      variables.DPr = 0;
      variables.DPrHRT = 0;
    }

    variables.resultadoCrudo = +calcularManchaAmarillaCrudo(
      variables.DPrHRT,
      variables.DPr,
      resistencia.multiplicador,
    ).toFixed(4);
    const resultado = calcularManchaAmarilla(
      variables.DPrHRT,
      variables.DPr,
      resistencia.multiplicador,
    );

    const prediccion: IPrediccionEnfermedad = {
      enfermedad: 'Mancha Amarilla',
      idEnfermedad: 'trigo.mancha_amarilla',
      resultado: predecir ? +resultado.toFixed(2) : 0,
      estado: 'calculado',
      ...metadataSanitariaTrigo(resistencia, contextoSeguro),
      modelo: {
        id: 'trigo.mancha_amarilla',
        version: TRIGO_MOTOR_SANITARIO_VERSION,
        fuente: 'Modelo propietario Chaman 2026 / Mancha Amarilla',
        resolucion: 'diaria',
        validacion: 'operativo_provisional',
        alcance:
          'Severidad meteorologica esperada; requiere diagnostico diferencial a campo.',
      },
      variables,
    };
    return prediccion;
  }
}
