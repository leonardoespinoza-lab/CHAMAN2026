import { Injectable } from '@nestjs/common';
import {
  IPrediccion,
  IPrediccionEnfermedad,
  ISemilla,
  IVariablesManchaAmarilla,
} from 'modelos/src';

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
  ): Promise<IPrediccionEnfermedad> {
    const prediccionAnteriorEnfermedad = prediccionAnterior?.enfermedades.find(
      (e) => e.enfermedad === 'Mancha Amarilla',
    );
    // Logger.log(
    //   `Prediccion de Mancha Amarilla fecha: ${fecha}, semilla: ${semilla}, clima: ${clima}, prediccionAnterior: ${prediccionAnteriorEnfermedad}`,
    // );
    const variables: IVariablesManchaAmarilla = {
      DPr: prediccionAnteriorEnfermedad
        ? (prediccionAnteriorEnfermedad?.variables as IVariablesManchaAmarilla)
            .DPr
        : 0,
      DPrHRT: prediccionAnteriorEnfermedad
        ? (prediccionAnteriorEnfermedad?.variables as IVariablesManchaAmarilla)
            .DPrHRT
        : 0,
    };

    if (clima.precip >= 2) {
      variables.DPr = predecir ? variables.DPr + 1 : 0;
    }
    // Dias con precipitaciones > 1mm y HR >= 80% y temp max <= 32°C y temp min >= 8°C
    if (
      clima.precip >= 1 &&
      clima.hr >= 80 &&
      clima.Tmax <= 32 &&
      clima.Tmin >= 8
    ) {
      variables.DPrHRT = predecir ? variables.DPrHRT + 1 : 0;
    }

    const resistencia = semilla.resistencia?.find(
      (r) => r.enfermedad === 'Mancha Amarilla',
    );

    if (!predecir) {
      variables.DPr = 0;
      variables.DPrHRT = 0;
    }

    let resultado =
      (-2.25 + 1.62 * variables.DPrHRT + 1.3 * variables.DPr) *
      (resistencia?.multiplicador || 1);
    if (resultado < 0) {
      resultado = 0;
    }

    const prediccion: IPrediccionEnfermedad = {
      enfermedad: 'Mancha Amarilla',
      resultado: predecir ? +resultado.toFixed(2) : 0,
      variables,
    };
    return prediccion;
  }
}
