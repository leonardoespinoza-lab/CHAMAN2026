import { Injectable } from '@nestjs/common';
import { IPrediccion, IPrediccionEnfermedad, ISemilla } from 'modelos/src';
import {
  calcularRoyaAnaranjada,
  resolverResistencia,
} from 'modelos/src/motores/enfermedades';
import {
  camposClimaticosFaltantes,
  crearPrediccionSinDatos,
  metadataResistencia,
} from './calidad';

@Injectable()
export class RoyaAnaranjadaService {
  async predecir(
    semilla: ISemilla,
    clima: {
      precip: number;
      Tmax: number;
      Tmin: number;
      hr: number;
      Tavg: number;
    },
    prediccionAnterior?: IPrediccion,
    predecir?: boolean,
  ): Promise<IPrediccionEnfermedad> {
    const faltantes = camposClimaticosFaltantes(clima, [
      'precip',
      'Tmax',
      'Tmin',
      'hr',
      'Tavg',
    ]);
    if (faltantes.length) {
      return crearPrediccionSinDatos(
        'Roya Anaranjada',
        'trigo.roya_anaranjada',
        faltantes,
        'Enfermedades en TRIGO -V2.xlsx / Roya Anaranjada',
      );
    }
    const prediccionAnteriorEnfermedad = prediccionAnterior?.enfermedades.find(
      (e) => e.enfermedad === 'Roya Anaranjada',
    );
    const prevVariables = (prediccionAnteriorEnfermedad?.variables || {}) as {
      GD?: number;
      DHR?: number;
      DL?: number;
    };
    const variables = {
      GD: Number(prevVariables.GD || 0),
      DHR: Number(prevVariables.DHR || 0),
      DL: Number(prevVariables.DL || 0),
    };

    const resistencia = resolverResistencia(
      semilla.resistencia,
      'trigo.roya_anaranjada',
    );

    if (predecir) {
      if (clima.hr > 60 && clima.Tavg >= 7 && clima.Tavg <= 14) {
        variables.GD = +(variables.GD + clima.Tavg).toFixed(2);
      }
      if (clima.hr > 75 && clima.precip <= 5) {
        variables.DHR += 1;
      }
      if (clima.precip >= 0.1 && clima.precip <= 2) {
        variables.DL += 1;
      }
    } else {
      variables.GD = 0;
      variables.DHR = 0;
      variables.DL = 0;
    }

    const resultado = calcularRoyaAnaranjada(
      variables.GD,
      variables.DHR,
      variables.DL,
      resistencia.indiceResistencia,
    );

    const prediccion: IPrediccionEnfermedad = {
      enfermedad: 'Roya Anaranjada',
      idEnfermedad: 'trigo.roya_anaranjada',
      resultado: predecir ? +resultado.toFixed(2) : 0,
      estado: 'calculado',
      ...metadataResistencia(resistencia),
      modelo: {
        id: 'trigo.roya_anaranjada',
        version: 3,
        fuente: 'Enfermedades en TRIGO -V2.xlsx / Roya Anaranjada',
        resolucion: 'diaria',
      },
      variables,
    };
    return prediccion;
  }

}
