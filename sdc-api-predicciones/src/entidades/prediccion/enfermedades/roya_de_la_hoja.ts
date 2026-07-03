import { Injectable } from '@nestjs/common';
import {
  IPrediccion,
  IPrediccionEnfermedad,
  ISemilla,
  IVariablesRoyaDeLaHoja,
} from 'modelos/src';

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
  ): Promise<IPrediccionEnfermedad> {
    const prediccionAnteriorEnfermedad = prediccionAnterior?.enfermedades.find(
      (e) => e.enfermedad === 'Roya de la Hoja',
    );
    // Logger.log(
    //   `Prediccion de Roya de la Hoja fecha: ${fecha}, semilla: ${semilla}, clima: ${clima}, prediccionAnterior: ${prediccionAnteriorEnfermedad}`,
    // );
    const variables: IVariablesRoyaDeLaHoja = {
      DHR: prediccionAnteriorEnfermedad
        ? (prediccionAnteriorEnfermedad?.variables as IVariablesRoyaDeLaHoja)
            .DHR
        : 0,
      GD: prediccionAnteriorEnfermedad
        ? (prediccionAnteriorEnfermedad?.variables as IVariablesRoyaDeLaHoja).GD
        : 0,
    };

    // Grados Dia
    let TB = 0;
    let GD = 0;
    if (clima.hr >= 49) {
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
    if (clima.precip <= 0.2 && clima.hr >= 70) {
      variables.DHR = predecir ? variables.DHR + 1 : 0;
    }

    const resistencia = semilla.resistencia?.find(
      (r) => r.enfermedad === 'Roya de la Hoja',
    );
    const IR = this.indiceResistenciaDesdeMultiplicador(
      resistencia?.multiplicador,
    );

    if (!predecir) {
      variables.DHR = 0;
      variables.GD = 0;
    }

    let resultado =
      4.42 +
      0.61 * variables.GD +
      0.57 * variables.DHR -
      30.01 * IR;
    if (resultado < 0) {
      resultado = 0;
    }

    const prediccion: IPrediccionEnfermedad = {
      enfermedad: 'Roya de la Hoja',
      resultado: predecir ? +resultado.toFixed(2) : 0,
      variables,
    };
    return prediccion;
  }

  private indiceResistenciaDesdeMultiplicador(multiplicador?: number): number {
    if (multiplicador === undefined || multiplicador === null) return 0;
    if (multiplicador <= 0.35) return 1;
    if (multiplicador <= 0.75) return 0.65;
    if (multiplicador <= 1.05) return 0.35;
    return 0;
  }
}
