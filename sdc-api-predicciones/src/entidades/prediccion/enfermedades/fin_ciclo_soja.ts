import { Injectable } from '@nestjs/common';
import {
  IPrediccion,
  IPrediccionEnfermedad,
  ISemilla,
  IVariablesFinDeCiclo,
} from 'modelos/src';
import {
  calcularFinCicloSoja,
  resolverResistencia,
} from 'modelos/src';
import {
  camposClimaticosFaltantes,
  crearPrediccionSinDatos,
  metadataResistencia,
} from './calidad';

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
    const faltantes = camposClimaticosFaltantes(clima, ['precip']);
    if (faltantes.length) {
      return crearPrediccionSinDatos(
        'Fin de Ciclo',
        'soja.fin_ciclo',
        faltantes,
        'Modelo Fin de Ciclo de Soja',
      );
    }
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

    const resistencia = resolverResistencia(
      semilla.resistencia,
      'soja.fin_ciclo',
    );

    const resultado = calcularFinCicloSoja(
      variables.Lt7,
      resistencia.multiplicador,
    );

    if (!predecir) {
      variables.PtAc7 = 0;
      variables.DPr7 = 0;
      variables.Lt7 = 0;
    }

    const prediccion: IPrediccionEnfermedad = {
      enfermedad: 'Fin de Ciclo',
      idEnfermedad: 'soja.fin_ciclo',
      resultado: predecir ? +resultado.toFixed(2) : 0,
      estado: 'calculado',
      ...metadataResistencia(resistencia),
      modelo: {
        id: 'soja.fin_ciclo',
        version: 3,
        fuente: 'Modelo Fin de Ciclo de Soja',
        resolucion: 'diaria',
        validacion: 'operativo_provisional',
        alcance:
          'Screening pluviometrico acumulativo para recorrida; no equivale a probabilidad, incidencia ni diagnostico.',
      },
      variables,
    };
    return prediccion;
  }
}
