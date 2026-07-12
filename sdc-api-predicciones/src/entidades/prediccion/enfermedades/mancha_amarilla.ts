import { Injectable } from '@nestjs/common';
import {
  IPrediccion,
  IPrediccionEnfermedad,
  ISemilla,
  IVariablesManchaAmarilla,
} from 'modelos/src';
import {
  calcularManchaAmarilla,
  resolverResistencia,
} from 'modelos/src';
import {
  camposClimaticosFaltantes,
  crearPrediccionSinDatos,
  metadataResistencia,
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
  ): Promise<IPrediccionEnfermedad> {
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
        'Enfermedades en TRIGO -V2.xlsx / Mancha Amarilla',
      );
    }
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

    const resistencia = resolverResistencia(
      semilla.resistencia,
      'trigo.mancha_amarilla',
    );

    if (!predecir) {
      variables.DPr = 0;
      variables.DPrHRT = 0;
    }

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
      ...metadataResistencia(resistencia),
      modelo: {
        id: 'trigo.mancha_amarilla',
        version: 3,
        fuente: 'Enfermedades en TRIGO -V2.xlsx / Mancha Amarilla',
        resolucion: 'diaria',
      },
      variables,
    };
    return prediccion;
  }
}
