import { Injectable, Logger } from '@nestjs/common';
import {
  IPrediccion,
  IPrediccionEnfermedad,
  ISemilla,
  IVariablesManchaDeLaHoja,
} from 'modelos/src';
import {
  calcularManchaHoja,
  resolverResistencia,
} from 'modelos/src';
import {
  camposClimaticosFaltantes,
  crearPrediccionSinDatos,
  metadataResistencia,
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
  ): Promise<IPrediccionEnfermedad> {
    const faltantes = camposClimaticosFaltantes(clima, ['precip', 'hr']);
    if (faltantes.length) {
      return crearPrediccionSinDatos(
        'Mancha de la Hoja',
        'trigo.mancha_hoja',
        faltantes,
        'Enfermedades en TRIGO -V2.xlsx / Mancha de la Hoja',
      );
    }
    const prediccionAnteriorEnfermedad = prediccionAnterior?.enfermedades.find(
      (e) => e.enfermedad === 'Mancha de la Hoja',
    );
    // Logger.log(
    //   `Prediccion de Mancha de la hoja fecha: ${fecha}, semilla: ${semilla}, clima: ${clima}, prediccionAnterior: ${prediccionAnteriorEnfermedad}`,
    // );
    const variables: IVariablesManchaDeLaHoja = {
      DHR: prediccionAnteriorEnfermedad
        ? (prediccionAnteriorEnfermedad?.variables as IVariablesManchaDeLaHoja)
            .DHR
        : 0,
      DPr: prediccionAnteriorEnfermedad
        ? (prediccionAnteriorEnfermedad?.variables as IVariablesManchaDeLaHoja)
            .DPr
        : 0,
    };
    if (clima.precip >= 10) {
      variables.DPr = predecir ? variables.DPr + 1 : 0;
    }
    if (clima.hr >= 80) {
      variables.DHR = predecir ? variables.DHR + 1 : 0;
    }

    const resistencia = resolverResistencia(
      semilla.resistencia,
      'trigo.mancha_hoja',
    );
    if (resistencia.desconocida) {
      Logger.debug(
        `No se encontró resistencia para "Mancha de la Hoja" en la semilla ${JSON.stringify(
          semilla,
        )}`,
      );
    }

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
      ...metadataResistencia(resistencia),
      modelo: {
        id: 'trigo.mancha_hoja',
        version: 3,
        fuente: 'Enfermedades en TRIGO -V2.xlsx / Mancha de la Hoja',
        resolucion: 'diaria',
      },
      variables,
    };
    return prediccion;
  }
}
