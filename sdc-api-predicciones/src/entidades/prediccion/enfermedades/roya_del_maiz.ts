import { Injectable } from '@nestjs/common';
import {
  IPrediccion,
  IPrediccionEnfermedad,
  ISemilla,
  IVariablesRoyaDelMaiz,
} from 'modelos/src';
import {
  calcularRoyaHoja,
  gradosDiaRoyaMaiz,
  resolverResistencia,
} from 'modelos/src';
import {
  camposClimaticosFaltantes,
  crearPrediccionSinDatos,
  metadataResistencia,
} from './calidad';

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
    const faltantes = camposClimaticosFaltantes(clima, [
      'precip',
      'hr',
      'Tavg',
    ]);
    if (faltantes.length) {
      return crearPrediccionSinDatos(
        'Roya del Maiz',
        'maiz.roya',
        faltantes,
        'Enfermedades en TRIGO -V2.xlsx / Roya de la Hoja',
      );
    }
    // Sev% = 4,42 + 0,61 GD + 0,57 DHR - 30,01 IR

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
    const GD = predecir ? gradosDiaRoyaMaiz(clima.hr, clima.Tavg) : 0;

    variables.GD = +(variables.GD + GD).toFixed(2);

    // Dias sin precipitaciones (<= 0.2) y HR >= 95%
    if (clima.precip <= 0.2 && clima.hr >= 95) {
      variables.DHR = predecir ? variables.DHR + 1 : 0;
    }

    // Resistencia
    const resistencia = resolverResistencia(
      semilla.resistencia,
      'maiz.roya',
    );

    // Formula
    const resultado = calcularRoyaHoja(
      variables.GD,
      variables.DHR,
      resistencia.indiceResistencia,
    );

    if (!predecir) {
      variables.DHR = 0;
      variables.GD = 0;
    }

    const prediccion: IPrediccionEnfermedad = {
      enfermedad: 'Roya del Maiz',
      idEnfermedad: 'maiz.roya',
      resultado: predecir ? +resultado.toFixed(2) : 0,
      estado: 'calculado',
      ...metadataResistencia(resistencia),
      modelo: {
        id: 'maiz.roya',
        version: 3,
        fuente: 'Enfermedades en TRIGO -V2.xlsx / Roya de la Hoja',
        resolucion: 'diaria',
      },
      variables,
    };
    return prediccion;
  }
}
