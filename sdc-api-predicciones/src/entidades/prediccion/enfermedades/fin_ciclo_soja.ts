import { Injectable } from '@nestjs/common';
import {
  IPrediccion,
  IPrediccionEnfermedad,
  ISemilla,
  IVariablesFinDeCiclo,
} from 'modelos/src';

@Injectable()
export class FinCicloSojaService {
  async predecir(
    semilla: ISemilla,
    clima: {
      precip: number;
    },
    prediccionAnterior?: IPrediccion,
    predecir?: boolean,
  ): Promise<IPrediccionEnfermedad> {
    const prediccionAnteriorEnfermedad = prediccionAnterior?.enfermedades.find(
      (e) => e.enfermedad === 'Fin de Ciclo',
    );
    // Logger.log(
    //   `Prediccion de Fusarium de la Espiga: fecha ${fecha}, semilla ${semilla}, clima ${clima}, prediccionAnterior ${prediccionAnteriorEnfermedad}`,
    // );

    const variables: IVariablesFinDeCiclo = {
      PtAc7: prediccionAnteriorEnfermedad
        ? (prediccionAnteriorEnfermedad?.variables as IVariablesFinDeCiclo)
            .PtAc7
        : 0,
      DPr7: prediccionAnteriorEnfermedad
        ? (prediccionAnteriorEnfermedad?.variables as IVariablesFinDeCiclo).DPr7
        : 0,
      Lt7: prediccionAnteriorEnfermedad
        ? (prediccionAnteriorEnfermedad?.variables as IVariablesFinDeCiclo).Lt7
        : 0,
    };

    if (!predecir) {
      variables.PtAc7 = 0;
      variables.DPr7 = 0;
      variables.Lt7 = 0;
    } else if (clima.precip >= 7) {
      variables.DPr7 += 1;
      variables.PtAc7 += clima.precip;
      variables.Lt7 = variables.DPr7 * variables.PtAc7;
    }

    let resultado = (8 * variables.Lt7) / 600;
    if (resultado < 0) {
      resultado = 0;
    }

    if (!predecir) {
      variables.PtAc7 = 0;
      variables.DPr7 = 0;
      variables.Lt7 = 0;
    }

    const prediccion: IPrediccionEnfermedad = {
      enfermedad: 'Fin de Ciclo',
      resultado: predecir ? +resultado.toFixed(2) : 0,
      variables,
    };
    return prediccion;
  }
}
