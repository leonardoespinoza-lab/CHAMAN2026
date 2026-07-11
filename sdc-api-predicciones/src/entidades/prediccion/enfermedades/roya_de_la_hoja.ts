import { Injectable } from '@nestjs/common';
import {
  IPrediccion,
  IPrediccionEnfermedad,
  ISemilla,
  IVariablesRoyaDeLaHoja,
} from 'modelos/src';
import {
  calcularRoyaHoja,
  resolverResistencia,
} from 'modelos/src/motores/enfermedades';
import {
  camposClimaticosFaltantes,
  crearPrediccionSinDatos,
  metadataResistencia,
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
  ): Promise<IPrediccionEnfermedad> {
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
        'Enfermedades en TRIGO -V2.xlsx / Roya de la Hoja',
      );
    }
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

    const resistencia = resolverResistencia(
      semilla.resistencia,
      'trigo.roya_hoja',
    );

    if (!predecir) {
      variables.DHR = 0;
      variables.GD = 0;
    }

    const resultado = calcularRoyaHoja(
      variables.GD,
      variables.DHR,
      resistencia.indiceResistencia,
    );

    const prediccion: IPrediccionEnfermedad = {
      enfermedad: 'Roya de la Hoja',
      idEnfermedad: 'trigo.roya_hoja',
      resultado: predecir ? +resultado.toFixed(2) : 0,
      estado: 'calculado',
      ...metadataResistencia(resistencia),
      modelo: {
        id: 'trigo.roya_hoja',
        version: 3,
        fuente: 'Enfermedades en TRIGO -V2.xlsx / Roya de la Hoja',
        resolucion: 'diaria',
      },
      variables,
    };
    return prediccion;
  }

}
