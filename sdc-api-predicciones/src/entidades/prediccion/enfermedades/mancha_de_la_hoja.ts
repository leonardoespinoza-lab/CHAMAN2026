import { Injectable, Logger } from '@nestjs/common';
import {
  IPrediccion,
  IPrediccionEnfermedad,
  ISemilla,
  IVariablesManchaDeLaHoja,
} from 'modelos/src';

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

    const resistencia = semilla.resistencia?.find(
      (r) => r.enfermedad === 'Mancha de la Hoja',
    );
    if (!resistencia) {
      Logger.debug(
        `No se encontró resistencia para "Mancha de la Hoja" en la semilla ${JSON.stringify(
          semilla,
        )}`,
      );
    }

    let resultado =
      (-6.41 + 0.59 * variables.DHR + 2.79 * variables.DPr) *
      (resistencia?.multiplicador || 1);
    if (resultado < 0) {
      resultado = 0;
    }

    if (!predecir) {
      variables.DPr = 0;
      variables.DHR = 0;
    }

    const prediccion: IPrediccionEnfermedad = {
      enfermedad: 'Mancha de la Hoja',
      resultado: predecir ? +resultado.toFixed(2) : 0,
      variables,
    };
    return prediccion;
  }
}
