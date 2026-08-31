import { Injectable } from '@nestjs/common';
import {
  IPrediccion,
  IPrediccionEnfermedad,
  ISemilla,
  IVariablesRoyaDeLaHoja,
} from 'modelos/src';
import {
  calcularRoyaHojaTrigo2026,
  calcularRoyaHojaTrigo2026Crudo,
  IContextoVentanaSanitariaTrigo,
  resolverResistencia,
  TRIGO_MOTOR_SANITARIO_VERSION,
} from 'modelos/src';
import {
  camposClimaticosFaltantes,
  crearPrediccionSinDatos,
  metadataSanitariaTrigo,
} from './calidad';

@Injectable()
export class RoyaDeLaHojaService {
  async predecir(
    semilla: ISemilla,
    clima: {
      precip: number;
      hr: number;
      Tavg: number;
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
        (e.idEnfermedad === 'trigo.roya_hoja' ||
          e.enfermedad === 'Roya de la Hoja') &&
        e.modelo?.version === TRIGO_MOTOR_SANITARIO_VERSION,
    );
    const anteriores = (prediccionAnteriorEnfermedad?.variables ||
      {}) as IVariablesRoyaDeLaHoja;
    const resistencia = resolverResistencia(
      semilla.resistencia,
      'trigo.roya_hoja',
    );
    const variables: IVariablesRoyaDeLaHoja = {
      ...anteriores,
      DHR: Math.max(0, Number(anteriores.DHR) || 0),
      GD: Math.max(0, Number(anteriores.GD) || 0),
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
      'Tavg',
    ]);
    if (faltantes.length) {
      return crearPrediccionSinDatos(
        'Roya de la Hoja',
        'trigo.roya_hoja',
        faltantes,
        'Modelo propietario Chaman 2026 / Roya de la Hoja',
        TRIGO_MOTOR_SANITARIO_VERSION,
        'operativo_provisional',
        variables,
      );
    }
    // Logger.log(
    //   `Prediccion de Roya de la Hoja fecha: ${fecha}, semilla: ${semilla}, clima: ${clima}, prediccionAnterior: ${prediccionAnteriorEnfermedad}`,
    // );
    // Grados Dia
    let TB = 0;
    let GD = 0;
    if (clima.hr > 49) {
      if (clima.Tavg >= 18) {
        TB = 18;
      }
      if (clima.Tavg < 18 && clima.Tavg >= 12) {
        TB = clima.Tavg;
      }
    }
    if (TB) {
      GD = predecir ? TB - 12 : 0;
    }

    variables.GD = +(variables.GD + GD).toFixed(2);

    // Dias sin precipitaciones (<= 0.2) y HR >= 70%
    if (clima.precip <= 0.2 && clima.hr > 70) {
      variables.DHR = predecir ? variables.DHR + 1 : 0;
    }

    if (!predecir) {
      variables.DHR = 0;
      variables.GD = 0;
    }

    variables.resultadoCrudo = +calcularRoyaHojaTrigo2026Crudo(
      variables.GD,
      variables.DHR,
      resistencia.multiplicador,
    ).toFixed(4);
    const resultado = calcularRoyaHojaTrigo2026(
      variables.GD,
      variables.DHR,
      resistencia.multiplicador,
    );

    const prediccion: IPrediccionEnfermedad = {
      enfermedad: 'Roya de la Hoja',
      idEnfermedad: 'trigo.roya_hoja',
      resultado: predecir ? +resultado.toFixed(2) : 0,
      estado: 'calculado',
      ...metadataSanitariaTrigo(resistencia, contextoSeguro),
      modelo: {
        id: 'trigo.roya_hoja',
        version: TRIGO_MOTOR_SANITARIO_VERSION,
        fuente: 'Modelo propietario Chaman 2026 / contrato sanitario trigo',
        resolucion: 'diaria',
        validacion: 'operativo_provisional',
        alcance:
          'Severidad meteorologica esperada; no confirma presencia de Puccinia triticina.',
      },
      variables,
    };
    return prediccion;
  }
}
