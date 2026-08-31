import { Injectable, Logger } from '@nestjs/common';
import {
  IContextoVentanaSanitariaTrigo,
  IPrediccion,
  IPrediccionEnfermedad,
  ISemilla,
  IVariablesManchaDeLaHoja,
  TRIGO_MOTOR_SANITARIO_VERSION,
} from 'modelos/src';
import {
  calcularManchaHoja,
  calcularManchaHojaCrudo,
  resolverResistencia,
} from 'modelos/src';
import {
  camposClimaticosFaltantes,
  crearPrediccionSinDatos,
  metadataSanitariaTrigo,
} from './calidad';

@Injectable()
export class ManchaDeLaHojaService {
  async predecir(
    semilla: ISemilla,
    clima: {
      precip: number;
      hr: number;
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
        (e.idEnfermedad === 'trigo.mancha_hoja' ||
          e.enfermedad === 'Mancha de la Hoja') &&
        e.modelo?.version === TRIGO_MOTOR_SANITARIO_VERSION,
    );
    const anteriores = (prediccionAnteriorEnfermedad?.variables ||
      {}) as IVariablesManchaDeLaHoja;
    const resistencia = resolverResistencia(
      semilla.resistencia,
      'trigo.mancha_hoja',
    );
    const variables: IVariablesManchaDeLaHoja = {
      ...anteriores,
      DHR: Math.max(0, Number(anteriores.DHR) || 0),
      DPr: Math.max(0, Number(anteriores.DPr) || 0),
      GDDBase0Siembra: contextoSeguro.gddBase0DesdeSiembra,
      coberturaGdd: contextoSeguro.coberturaGdd,
      umbralInicioGdd: contextoSeguro.fenologiaObservada ? 800 : 850,
      inicioPorFenologiaObservada: contextoSeguro.fenologiaObservada ? 1 : 0,
      factorSusceptibilidad: resistencia.multiplicador,
      formulaVersion: TRIGO_MOTOR_SANITARIO_VERSION,
    };
    const faltantes = camposClimaticosFaltantes(clima, ['precip', 'hr']);
    if (faltantes.length) {
      return crearPrediccionSinDatos(
        'Mancha de la Hoja',
        'trigo.mancha_hoja',
        faltantes,
        'Modelo propietario Chaman 2026 / Mancha de la Hoja',
        TRIGO_MOTOR_SANITARIO_VERSION,
        'operativo_provisional',
        variables,
      );
    }
    // Logger.log(
    //   `Prediccion de Mancha de la hoja fecha: ${fecha}, semilla: ${semilla}, clima: ${clima}, prediccionAnterior: ${prediccionAnteriorEnfermedad}`,
    // );
    if (clima.precip > 10) {
      variables.DPr = predecir ? variables.DPr + 1 : 0;
    }
    if (clima.hr >= 80) {
      variables.DHR = predecir ? variables.DHR + 1 : 0;
    }

    if (resistencia.desconocida) {
      Logger.debug(
        `No se encontró resistencia para "Mancha de la Hoja" en la semilla ${JSON.stringify(
          semilla,
        )}`,
      );
    }

    variables.resultadoCrudo = +calcularManchaHojaCrudo(
      variables.DHR,
      variables.DPr,
      resistencia.multiplicador,
    ).toFixed(4);
    const resultado = calcularManchaHoja(
      variables.DHR,
      variables.DPr,
      resistencia.multiplicador,
    );

    if (!predecir) {
      variables.DPr = 0;
      variables.DHR = 0;
    }

    const prediccion: IPrediccionEnfermedad = {
      enfermedad: 'Mancha de la Hoja',
      idEnfermedad: 'trigo.mancha_hoja',
      resultado: predecir ? +resultado.toFixed(2) : 0,
      estado: 'calculado',
      ...metadataSanitariaTrigo(resistencia, contextoSeguro),
      modelo: {
        id: 'trigo.mancha_hoja',
        version: TRIGO_MOTOR_SANITARIO_VERSION,
        fuente: 'Modelo propietario Chaman 2026 / Mancha de la Hoja',
        resolucion: 'diaria',
        validacion: 'operativo_provisional',
        alcance:
          'Severidad meteorologica esperada; no sustituye identificacion de sintomas.',
      },
      variables,
    };
    return prediccion;
  }
}
