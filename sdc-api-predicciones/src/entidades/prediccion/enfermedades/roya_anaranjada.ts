import { Injectable } from '@nestjs/common';
import { IPrediccionEnfermedad, ISemilla } from 'modelos/src';

@Injectable()
export class RoyaAnaranjadaService {
  async predecir(
    semilla: ISemilla,
    clima: {
      Tmax: number;
      Tmin: number;
      viento: number;
      hr: number;
    },
    predecir?: boolean,
  ): Promise<IPrediccionEnfermedad> {
    const resistencia = semilla.resistencia?.find(
      (r) => r.enfermedad === 'Roya Anaranjada',
    );

    // (SEVERIDAD = -63,11 + 0,96*x1  + 1,72*x2  + 3,72*x3  + 0,43*x4 )
    // x1= Temperatura mínima.		x3= Velocidad del Viento.
    // x2= Temperatura máxima.		x4= Humedad Relativa.

    // a) Severidad baja	infección < 5% (royas) y < 10% (manchas)
    // b) Severidad media	infección de entre 15 y 20% del área foliar
    // c) Severidad alta	infección > 20% del área foliar.

    let resultado =
      (-63.11 +
        0.96 * clima.Tmin +
        1.72 * clima.Tmax +
        3.72 * clima.viento +
        0.43 * clima.hr) *
      (resistencia?.multiplicador || 1);
    if (resultado < 0) {
      resultado = 0;
    }

    const prediccion: IPrediccionEnfermedad = {
      enfermedad: 'Roya Anaranjada',
      resultado: predecir ? +resultado.toFixed(2) : 0,
      variables: null,
    };
    return prediccion;
  }
}
