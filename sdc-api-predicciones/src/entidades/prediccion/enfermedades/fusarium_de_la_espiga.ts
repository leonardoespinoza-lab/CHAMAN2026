import { Injectable } from '@nestjs/common';
import {
  IPrediccion,
  IPrediccionEnfermedad,
  ISemilla,
  IVariablesFusariumDeLaEspiga,
} from 'modelos/src';
import {
  calcularFusariumEspiga,
  resolverResistencia,
} from 'modelos/src/motores/enfermedades';
import {
  camposClimaticosFaltantes,
  crearPrediccionSinDatos,
  metadataResistencia,
} from './calidad';

@Injectable()
export class FusariumDeLaEspigaService {
  async predecir(
    semilla: ISemilla,
    clima: {
      precip: number;
      precipAnterior: number;
      hr: number;
      hrAnterior: number;
      Tavg: number;
      Tmin: number;
      Tmax: number;
    },
    prediccionAnterior?: IPrediccion,
    predecir?: boolean,
  ): Promise<IPrediccionEnfermedad> {
    const faltantes = camposClimaticosFaltantes(clima, [
      'precip',
      'precipAnterior',
      'hr',
      'hrAnterior',
      'Tavg',
      'Tmin',
      'Tmax',
    ]);
    if (faltantes.length) {
      return crearPrediccionSinDatos(
        'Fusarium de la Espiga',
        'trigo.fusarium_espiga',
        faltantes,
        'Enfermedades en TRIGO -V2.xlsx / FUSARIUM',
      );
    }
    const prediccionAnteriorEnfermedad = prediccionAnterior?.enfermedades.find(
      (e) => e.enfermedad === 'Fusarium de la Espiga',
    );
    // Logger.log(
    //   `Prediccion de Fusarium de la Espiga: fecha ${fecha}, semilla ${semilla}, clima ${clima}, prediccionAnterior ${prediccionAnteriorEnfermedad}`,
    // );

    const variables: IVariablesFusariumDeLaEspiga = {
      GDN: prediccionAnteriorEnfermedad
        ? (
            prediccionAnteriorEnfermedad?.variables as IVariablesFusariumDeLaEspiga
          ).GDN
        : 0,
      PMoj: prediccionAnteriorEnfermedad
        ? (
            prediccionAnteriorEnfermedad?.variables as IVariablesFusariumDeLaEspiga
          ).PMoj
        : 0,
      GDAcum: prediccionAnteriorEnfermedad
        ? (
            prediccionAnteriorEnfermedad?.variables as IVariablesFusariumDeLaEspiga
          ).GDAcum
        : 0,
    };

    if (variables.GDAcum < 530) {
      // Suma de temperaturas medias

      variables.GDAcum = predecir
        ? +(variables.GDAcum + clima.Tavg).toFixed(2)
        : 0;

      // número de períodos de mojado de 2 días con registro de precipitación > 0,2 y HR>81% en el día 1 y una HR≥78% en el día 2.
      if (
        clima.precipAnterior >= 0.2 &&
        clima.hrAnterior >= 81 &&
        clima.precip >= 0.2 &&
        clima.hr >= 78
      ) {
        variables.PMoj = predecir ? variables.PMoj + 1 : 0;
      }

      // GDN = GDTx + GDTn
      // GDTx = ∑d (Tx-26) si Tx>26°C
      // GDTn = ∑d (9-Tn)  si Tn<9°C
      let resisual = 0;
      if (clima.Tmax > 26) {
        resisual += clima.Tmax - 26;
      }
      if (clima.Tmin < 9) {
        resisual += 9 - clima.Tmin;
      }
      variables.GDN = predecir ? +(variables.GDN + resisual).toFixed(2) : 0;

      const resistencia = resolverResistencia(
        semilla.resistencia,
        'trigo.fusarium_espiga',
      );

      const resultado = calcularFusariumEspiga(
        variables.PMoj,
        variables.GDN,
        resistencia.multiplicador,
      );

      if (!predecir) {
        variables.PMoj = 0;
        variables.GDN = 0;
        variables.GDAcum = 0;
      }

      const prediccion: IPrediccionEnfermedad = {
        enfermedad: 'Fusarium de la Espiga',
        idEnfermedad: 'trigo.fusarium_espiga',
        resultado: predecir ? +resultado.toFixed(2) : 0,
        estado: 'calculado',
        ...metadataResistencia(resistencia),
        modelo: {
          id: 'trigo.fusarium_espiga',
          version: 3,
          fuente: 'Enfermedades en TRIGO -V2.xlsx / FUSARIUM',
          resolucion: 'diaria',
        },
        variables,
      };
      return prediccion;
    }
    const resistencia = resolverResistencia(
      semilla.resistencia,
      'trigo.fusarium_espiga',
    );
    return {
      enfermedad: 'Fusarium de la Espiga',
      idEnfermedad: 'trigo.fusarium_espiga',
      resultado: 0,
      estado: 'fuera_ventana',
      ...metadataResistencia(resistencia),
      modelo: {
        id: 'trigo.fusarium_espiga',
        version: 3,
        fuente: 'Enfermedades en TRIGO -V2.xlsx / FUSARIUM',
        resolucion: 'diaria',
      },
      variables,
    };
  }
}
