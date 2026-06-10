import { Injectable } from '@nestjs/common';
import {
  IPrediccion,
  IPrediccionEnfermedad,
  ISemilla,
  IVariablesRoyaDelMaiz,
} from 'modelos/src';

@Injectable()
export class RoyaDelMaizService {
  async predecir(
    semilla: ISemilla,
    clima: {
      precip: number;
      hr: number;
      Tavg: number;
    },
    prediccionAnterior?: IPrediccion,
    predecir?: boolean,
  ): Promise<IPrediccionEnfermedad> {
    // Sev% = 4,42 + 0,61 GD - 0,57 DHR – 30,01 IR

    const prediccionAnteriorEnfermedad = prediccionAnterior?.enfermedades.find(
      (e) => e.enfermedad === 'Roya del Maiz',
    );
    // Logger.log(
    //   `Prediccion de Roya de la Hoja fecha: ${fecha}, semilla: ${semilla}, clima: ${clima}, prediccionAnterior: ${prediccionAnteriorEnfermedad}`,
    // );
    const variables: IVariablesRoyaDelMaiz = {
      DHR: prediccionAnteriorEnfermedad
        ? (prediccionAnteriorEnfermedad?.variables as IVariablesRoyaDelMaiz).DHR
        : 0,
      GD: prediccionAnteriorEnfermedad
        ? (prediccionAnteriorEnfermedad?.variables as IVariablesRoyaDelMaiz).GD
        : 0,
    };

    // Grados Dia
    let TB = 0;
    let GD = 0;
    if (clima.hr >= 95) {
      if (clima.Tavg >= 17) {
        TB = 17;
      }
      if (clima.Tavg < 17 && clima.Tavg >= 8) {
        TB = clima.Tavg;
      }
    }
    if (TB) {
      GD = predecir ? TB - 8 : 0;
    }

    variables.GD = +(variables.GD + GD).toFixed(2);

    // Dias sin precipitaciones (<= 0.2) y HR >= 95%
    if (clima.precip <= 0.2 && clima.hr >= 95) {
      variables.DHR = predecir ? variables.DHR + 1 : 0;
    }

    // Resistencia
    const resistencia = semilla.resistencia?.find(
      (r) => r.enfermedad === 'Roya del Maiz',
    );

    // Formula
    let resultado =
      4.42 +
      0.61 * variables.GD +
      0.57 * variables.DHR -
      30.01 * (resistencia?.multiplicador || 1);
    if (resultado < 0) {
      resultado = 0;
    }

    if (!predecir) {
      variables.DHR = 0;
      variables.GD = 0;
    }

    const prediccion: IPrediccionEnfermedad = {
      enfermedad: 'Roya del Maiz',
      resultado: predecir ? +resultado.toFixed(2) : 0,
      variables,
    };
    return prediccion;
  }
}
