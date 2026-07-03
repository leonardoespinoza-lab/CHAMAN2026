import { Injectable } from '@nestjs/common';
import { IPrediccion, IPrediccionEnfermedad, ISemilla } from 'modelos/src';

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

    const resistencia = semilla.resistencia?.find(
      (r) => r.enfermedad === 'Roya Anaranjada',
    );
    const IR = this.indiceResistenciaDesdeMultiplicador(
      resistencia?.multiplicador,
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

    let resultado =
      5.15 +
      0.72 * variables.GD +
      0.48 * variables.DHR +
      0.35 * variables.DL -
      35.2 * IR;
    if (resultado < 0) {
      resultado = 0;
    }

    const prediccion: IPrediccionEnfermedad = {
      enfermedad: 'Roya Anaranjada',
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
