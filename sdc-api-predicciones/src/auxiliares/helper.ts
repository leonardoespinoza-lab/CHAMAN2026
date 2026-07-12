import {
  Cultivo,
  IClimaEstacionMeteorologica,
  ICoordenadas,
  ICrono,
  IEtapasMaiz,
  IEtapasSoja,
  IEtapasTrigo,
  IFumigacion,
  IPronosticoEstacionMeteorologica,
} from 'modelos/src';
import { BadRequestException, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';

// Definición de cada estadio con sus propiedades
interface Stage {
  name: string;
  kcProm: number;
  days: number;
}

export class HelperService {
  static distanciaEnMetros(punto1: ICoordenadas, punto2: ICoordenadas) {
    if (+punto1?.lat && +punto1?.lng && +punto2?.lat && +punto2?.lng) {
      const R = 6371e3; // metres
      const φ1 = punto1.lat * (Math.PI / 180); // φ, λ in radians
      const φ2 = punto2.lat * (Math.PI / 180);
      const Δφ = (punto2.lat - punto1.lat) * (Math.PI / 180);
      const Δλ = (punto2.lng - punto1.lng) * (Math.PI / 180);

      const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      const d = R * c; // in metres
      return d;
    }
    throw new BadRequestException('Error en los parametros de distancia');
  }

  static horasTranscurridasDesde(fecha: Date) {
    const horaActual = new Date();
    const horaFecha = new Date(fecha);
    const diferencia = horaActual.getTime() - horaFecha.getTime();
    const horasTranscurridas = Math.floor(diferencia / (1000 * 60 * 60));
    return horasTranscurridas;
  }

  static getHR(clima: IClimaEstacionMeteorologica[], fecha: string) {
    const find = clima.find((c) => c.fecha === fecha);
    if (find) {
      return find?.humedad?.avg;
    } else {
      const soloFecha = fecha.split('T')[0];
      const find = clima.find((c) => c.fecha.includes(soloFecha));
      return find?.humedad?.avg;
    }
  }

  static getViento(clima: IClimaEstacionMeteorologica[], fecha: string) {
    const find = clima.find((c) => c.fecha === fecha);
    if (find) {
      return find?.velocidadViento?.avg;
    } else {
      const soloFecha = fecha.split('T')[0];
      const find = clima.find((c) => c.fecha.includes(soloFecha));
      return find?.velocidadViento?.avg;
    }
  }

  static getTAvg(clima: IClimaEstacionMeteorologica[], fecha: string) {
    const find = clima.find((c) => c.fecha === fecha);
    if (find) {
      return find?.temperatura?.avg;
    } else {
      const soloFecha = fecha.split('T')[0];
      const find = clima.find((c) => c.fecha.includes(soloFecha));
      return find?.temperatura?.avg;
    }
  }

  static getTMin(clima: IClimaEstacionMeteorologica[], fecha: string) {
    const find = clima.find((c) => c.fecha === fecha);
    if (find) {
      return find?.temperatura?.min;
    } else {
      const soloFecha = fecha.split('T')[0];
      const find = clima.find((c) => c.fecha.includes(soloFecha));
      return find?.temperatura?.min;
    }
  }

  static getTMax(clima: IClimaEstacionMeteorologica[], fecha: string) {
    const find = clima.find((c) => c.fecha === fecha);
    if (find) {
      return find?.temperatura?.max;
    } else {
      const soloFecha = fecha.split('T')[0];
      const find = clima.find((c) => c.fecha.includes(soloFecha));
      return find?.temperatura?.max;
    }
  }

  static getPrecip(clima: IClimaEstacionMeteorologica[], fecha: string) {
    const find = clima.find((c) => c.fecha === fecha);
    if (find) {
      return find?.lluvia?.sum;
    } else {
      const soloFecha = fecha.split('T')[0];
      const find = clima.find((c) => c.fecha.includes(soloFecha));
      return find?.lluvia?.sum;
    }
  }

  static fechasFumigadas(fumigaciones: IFumigacion[]): string[] {
    const fechas: string[] = [];
    fumigaciones.forEach((f) => {
      const fechaFumigacion = new Date(f.fechaFumigacion);
      fechaFumigacion.setUTCHours(3, 0, 0, 0);
      for (let index = 0; index < (f.duracion || 15); index++) {
        fechas.push(fechaFumigacion.toISOString());
        fechaFumigacion.setUTCDate(fechaFumigacion.getUTCDate() + 1);
      }
    });
    return fechas;
  }

  static getStages(cultivo: Cultivo, crono: ICrono): Stage[] {
    const stagesMaiz: Stage[] = [
      { name: 'Emergencia', kcProm: 0.175, days: 0 },
      // { name: 'V4', kcProm: 0.425, days: 38 },
      // { name: 'V8', kcProm: 0.825, days: 56 },
      // { name: 'V12', kcProm: 0.94, days: 63 },
      // { name: 'VT', kcProm: 1.06, days: 71 },
      { name: 'emergencia_floracion', kcProm: 1.2, days: 76 },
      // { name: 'R2', kcProm: 1.15, days: 84 },
      // { name: 'R3', kcProm: 1.05, days: 93 },
      // { name: 'R4', kcProm: 0.9, days: 105 },
      // { name: 'R5', kcProm: 0.725, days: 112 },
      // { name: 'R6', kcProm: 0.35, days: 118 },
      { name: 'floracion_madurez', kcProm: 0.125, days: 160 },
    ];
    const stagesSoja: Stage[] = [
      { name: 'Emergencia', kcProm: 0.4, days: 0 },
      // { name: 'V4', kcProm: 0.5, days: 11 },
      // { name: 'V8', kcProm: 0.75, days: 22 },
      // { name: 'V12', kcProm: 0.95, days: 33 },
      { name: 'emergencia_R1', kcProm: 1.05, days: 44 },
      // { name: 'R2', kcProm: 1.16, days: 51 },
      { name: 'R1_R3', kcProm: 1.02, days: 66 },
      // { name: 'R4', kcProm: 0.9, days: 70 },
      { name: 'R3_R5', kcProm: 0.85, days: 80 },
      // { name: 'R6', kcProm: 0.65, days: 92 },
      { name: 'R5_R7', kcProm: 0.4, days: 118 },
    ];
    const stagesTrigo: Stage[] = [
      { name: 'Emergencia', kcProm: 0.3, days: 0 },
      { name: 'R1_R2', kcProm: 0.5, days: 102 },
      { name: 'R2_R3', kcProm: 0.75, days: 124 },
      { name: 'R3_R4', kcProm: 0.95, days: 138 },
      { name: 'R4_R5', kcProm: 1.15, days: 144 },
      { name: 'R5_R6', kcProm: 0.9, days: 151 },
      { name: 'R6_R7', kcProm: 0.4, days: 185 },
    ];

    if (!crono) {
      Logger.warn('No se encontró crono');
      switch (cultivo) {
        case 'Maiz':
          return stagesMaiz;
        case 'Soja':
          return stagesSoja;
        case 'Trigo':
          return stagesTrigo;
        default:
          return [{ name: 'Inicio', kcProm: 0.5, days: 0 }];
      }
    }

    if (cultivo === 'Trigo') {
      const etapas = crono.etapas as IEtapasTrigo;
      const tiempoEmergencia = etapas.R0_R1;
      for (let i = 1; i < stagesTrigo.length; i++) {
        const stage = stagesTrigo[i];
        const tiempoEtapa = etapas[stage.name] as number;
        stage.days = tiempoEtapa - tiempoEmergencia;
      }
      return stagesTrigo;
    }

    if (cultivo === 'Maiz') {
      const etapas = crono.etapas as IEtapasMaiz;
      const tiempoEmergencia = etapas.siembra_emergencia;
      for (let i = 1; i < stagesMaiz.length; i++) {
        const stage = stagesMaiz[i];
        const tiempoEtapa = etapas[stage.name] as number;
        stage.days = tiempoEtapa - tiempoEmergencia;
      }
      return stagesMaiz;
    }

    if (cultivo === 'Soja') {
      const etapas = crono.etapas as IEtapasSoja;
      const tiempoEmergencia = etapas.siembra_emergencia;
      for (let i = 1; i < stagesSoja.length; i++) {
        const stage = stagesSoja[i];
        const tiempoEtapa = etapas[stage.name] as number;
        stage.days = tiempoEtapa - tiempoEmergencia;
      }
      return stagesSoja;
    }

    return HelperService.getGenericStages(crono);
  }

  private static getGenericStages(crono: ICrono): Stage[] {
    const etapas = (crono?.etapas || {}) as Record<string, number>;
    const stages: Stage[] = [{ name: 'Inicio', kcProm: 0.35, days: 0 }];
    let acumulado = 0;

    for (const key of Object.keys(etapas)) {
      acumulado += Number(etapas[key] || 0);
      stages.push({ name: key, kcProm: 0.75, days: acumulado });
    }

    return stages.length > 1 ? stages : [{ name: 'Inicio', kcProm: 0.5, days: 0 }];
  }

  /**
   * Función para calcular el Kc Prom estimado para una cantidad de días dada desde la emergencia
   * @param diasDesdeEmergencia
   * @param cultivo
   * @returns
   */
  static getKc(diasDesdeEmergencia: number, cultivo: Cultivo, crono: ICrono) {
    const stages = HelperService.getStages(cultivo, crono);

    // Si los días están fuera del rango, devuelve el valor más cercano
    if (diasDesdeEmergencia <= stages[0].days) return stages[0].kcProm;
    if (diasDesdeEmergencia >= stages[stages.length - 1].days)
      return stages[stages.length - 1].kcProm;

    // Buscar los estadios entre los que cae la cantidad de días
    for (let i = 0; i < stages.length - 1; i++) {
      const currentStage = stages[i];
      const nextStage = stages[i + 1];

      if (
        diasDesdeEmergencia >= currentStage.days &&
        diasDesdeEmergencia <= nextStage.days
      ) {
        // Interpolación lineal para estimar el Kc Prom
        const proportion =
          (diasDesdeEmergencia - currentStage.days) /
          (nextStage.days - currentStage.days);

        const suma = proportion * (nextStage.kcProm - currentStage.kcProm);
        const result = currentStage.kcProm + suma;
        return +result.toFixed(2);
      }
    }

    // Si no se encuentra, devolver 0 por seguridad
    return 0;
  }

  static getUmbralDeRiego(cultivo: Cultivo, et0: number): number {
    // MAIZ - SOJA - SORGO - VID - ALGODÓN - OLIVO - TABACO - REMOLACHA
    const cultivos1 = [
      'Maiz',
      'Soja',
      'Sorgo',
      'Vid',
      'Algodón',
      'Olivo',
      'Tabaco',
      'Remolacha',
    ];
    const valoresCultivos1 = [
      {
        et0: 0,
        umbralRiego: 0.95,
      },
      {
        et0: 1,
        umbralRiego: 0.9,
      },
      {
        et0: 2,
        umbralRiego: 0.88,
      },
      {
        et0: 3,
        umbralRiego: 0.8,
      },
      {
        et0: 4,
        umbralRiego: 0.7,
      },
      {
        et0: 5,
        umbralRiego: 0.6,
      },
      {
        et0: 6,
        umbralRiego: 0.55,
      },
      {
        et0: 7,
        umbralRiego: 0.5,
      },
      {
        et0: 8,
        umbralRiego: 0.45,
      },
      {
        et0: 9,
        umbralRiego: 0.43,
      },
      {
        et0: 10,
        umbralRiego: 0.4,
      },
      {
        et0: 11,
        umbralRiego: 0.38,
      },
      {
        et0: 12,
        umbralRiego: 0.37,
      },
    ];
    // TRIGO - ALFALFA - MANI - ARVEJA - CITIRCOS - GIRASOL - MELON
    const cultivos2 = [
      'Trigo',
      'Alfalfa',
      'Maní',
      'Arveja',
      'Cítricos',
      'Girasol',
      'Melón',
    ];
    const valoresCultivos2 = [
      {
        et0: 0,
        umbralRiego: 0.9,
      },
      {
        et0: 1,
        umbralRiego: 0.85,
      },
      {
        et0: 2,
        umbralRiego: 0.8,
      },
      {
        et0: 3,
        umbralRiego: 0.7,
      },
      {
        et0: 4,
        umbralRiego: 0.6,
      },
      {
        et0: 5,
        umbralRiego: 0.5,
      },
      {
        et0: 6,
        umbralRiego: 0.45,
      },
      {
        et0: 7,
        umbralRiego: 0.43,
      },
      {
        et0: 8,
        umbralRiego: 0.38,
      },
      {
        et0: 9,
        umbralRiego: 0.35,
      },
      {
        et0: 10,
        umbralRiego: 0.3,
      },
      {
        et0: 11,
        umbralRiego: 0.28,
      },
      {
        et0: 12,
        umbralRiego: 0.27,
      },
    ];
    // BANANA - REPOLLO - POROTO - TOMATE
    const cultivos3 = ['Banana', 'Repollo', 'Poroto', 'Tomate'];
    const valoresCultivos3 = [
      {
        et0: 0,
        umbralRiego: 0.8,
      },
      {
        et0: 1,
        umbralRiego: 0.75,
      },
      {
        et0: 2,
        umbralRiego: 0.68,
      },
      {
        et0: 3,
        umbralRiego: 0.58,
      },
      {
        et0: 4,
        umbralRiego: 0.48,
      },
      {
        et0: 5,
        umbralRiego: 0.4,
      },
      {
        et0: 6,
        umbralRiego: 0.35,
      },
      {
        et0: 7,
        umbralRiego: 0.33,
      },
      {
        et0: 8,
        umbralRiego: 0.28,
      },
      {
        et0: 9,
        umbralRiego: 0.25,
      },
      {
        et0: 10,
        umbralRiego: 0.23,
      },
      {
        et0: 11,
        umbralRiego: 0.21,
      },
      {
        et0: 12,
        umbralRiego: 0.2,
      },
    ];
    // BANANA - REPOLLO - POROTO - TOMATE
    const cultivos4 = ['Banana', 'Repollo', 'Poroto', 'Tomate'];
    const valoresCultivos4 = [
      {
        et0: 0,
        umbralRiego: 0.7,
      },
      {
        et0: 1,
        umbralRiego: 0.6,
      },
      {
        et0: 2,
        umbralRiego: 0.5,
      },
      {
        et0: 3,
        umbralRiego: 0.43,
      },
      {
        et0: 4,
        umbralRiego: 0.35,
      },
      {
        et0: 5,
        umbralRiego: 0.3,
      },
      {
        et0: 6,
        umbralRiego: 0.25,
      },
      {
        et0: 7,
        umbralRiego: 0.23,
      },
      {
        et0: 8,
        umbralRiego: 0.2,
      },
      {
        et0: 9,
        umbralRiego: 0.2,
      },
      {
        et0: 10,
        umbralRiego: 0.18,
      },
      {
        et0: 11,
        umbralRiego: 0.18,
      },
      {
        et0: 12,
        umbralRiego: 0.17,
      },
    ];

    // Validar entrada
    if (!cultivo || typeof et0 !== 'number' || isNaN(et0)) {
      console.warn(
        `[getUmbralDeRiego] Parámetros inválidos: cultivo=${cultivo}, et0=${et0}`,
      );
      return 0.5; // Valor por defecto razonable
    }

    // Limitar et0 al rango válido y redondear
    const et0Limitado = Math.max(0, Math.min(12, et0));
    const et0Redondeado = Math.round(et0Limitado);

    // Buscar tabla apropiada según cultivo
    let tablaValores: Array<{ et0: number; umbralRiego: number }>;

    if (cultivos1.includes(cultivo)) {
      tablaValores = valoresCultivos1;
    } else if (cultivos2.includes(cultivo)) {
      tablaValores = valoresCultivos2;
    } else if (cultivos3.includes(cultivo)) {
      tablaValores = valoresCultivos3;
    } else if (cultivos4.includes(cultivo)) {
      tablaValores = valoresCultivos4;
    } else {
      console.warn(
        `[getUmbralDeRiego] Cultivo no reconocido: ${cultivo}, usando tabla por defecto`,
      );
      tablaValores = valoresCultivos2; // Usar tabla 2 como default
    }

    // Buscar valor exacto
    const valorEncontrado = tablaValores.find((v) => v.et0 === et0Redondeado);

    if (valorEncontrado) {
      return valorEncontrado.umbralRiego;
    }

    // Si no se encuentra valor exacto (esto no debería pasar con et0Limitado), usar el más cercano
    console.warn(
      `[getUmbralDeRiego] No se encontró valor para et0=${et0Redondeado}, usando valor más cercano`,
    );
    const valorMasCercano = tablaValores.reduce((prev, curr) =>
      Math.abs(curr.et0 - et0Redondeado) < Math.abs(prev.et0 - et0Redondeado)
        ? curr
        : prev,
    );

    return valorMasCercano.umbralRiego;
  }

  // Función para obtener el valor correspondiente (o aproximado por interpolación)
  // static getCapacidadRetencion(profundidad: number, anchoDeBulbo: number) {
  //   const tablaValores: Record<number, Record<number, number>> = {
  //     0.1: {
  //       0.1: 1.2,
  //       0.2: 2.4,
  //       0.3: 3.6,
  //       0.4: 4.8,
  //       0.5: 6.0,
  //       0.6: 7.2,
  //       0.7: 8.4,
  //       0.8: 9.6,
  //       0.9: 10.8,
  //       1.0: 12.0,
  //     },
  //     0.2: {
  //       0.1: 1.5,
  //       0.2: 3.0,
  //       0.3: 4.5,
  //       0.4: 6.0,
  //       0.5: 7.4,
  //       0.6: 8.9,
  //       0.7: 10.4,
  //       0.8: 11.9,
  //       0.9: 13.4,
  //       1.0: 14.9,
  //     },
  //     0.3: {
  //       0.1: 1.9,
  //       0.2: 3.8,
  //       0.3: 5.8,
  //       0.4: 7.7,
  //       0.5: 9.6,
  //       0.6: 11.5,
  //       0.7: 13.4,
  //       0.8: 15.4,
  //       0.9: 17.3,
  //       1.0: 19.2,
  //     },
  //     0.4: {
  //       0.1: 2.1,
  //       0.2: 4.2,
  //       0.3: 6.3,
  //       0.4: 8.4,
  //       0.5: 10.5,
  //       0.6: 12.6,
  //       0.7: 14.7,
  //       0.8: 16.8,
  //       0.9: 18.9,
  //       1.0: 21.0,
  //     },
  //     0.5: {
  //       0.1: 2.3,
  //       0.2: 4.6,
  //       0.3: 6.8,
  //       0.4: 9.1,
  //       0.5: 11.4,
  //       0.6: 13.7,
  //       0.7: 15.9,
  //       0.8: 18.2,
  //       0.9: 20.5,
  //       1.0: 22.8,
  //     },
  //     0.6: {
  //       0.1: 2.3,
  //       0.2: 4.5,
  //       0.3: 6.8,
  //       0.4: 9.0,
  //       0.5: 11.3,
  //       0.6: 13.5,
  //       0.7: 15.8,
  //       0.8: 18.1,
  //       0.9: 20.3,
  //       1.0: 22.6,
  //     },
  //     0.7: {
  //       0.1: 2.3,
  //       0.2: 4.5,
  //       0.3: 6.8,
  //       0.4: 9.0,
  //       0.5: 11.3,
  //       0.6: 13.5,
  //       0.7: 15.8,
  //       0.8: 18.1,
  //       0.9: 20.3,
  //       1.0: 22.6,
  //     },
  //     0.8: {
  //       0.1: 2.3,
  //       0.2: 4.5,
  //       0.3: 6.8,
  //       0.4: 9.0,
  //       0.5: 11.3,
  //       0.6: 13.5,
  //       0.7: 15.8,
  //       0.8: 18.1,
  //       0.9: 20.3,
  //       1.0: 22.6,
  //     },
  //     0.9: {
  //       0.1: 2.3,
  //       0.2: 4.5,
  //       0.3: 6.8,
  //       0.4: 9.0,
  //       0.5: 11.3,
  //       0.6: 13.5,
  //       0.7: 15.8,
  //       0.8: 18.1,
  //       0.9: 20.3,
  //       1.0: 22.6,
  //     },
  //     1.0: {
  //       0.1: 2.3,
  //       0.2: 4.5,
  //       0.3: 6.8,
  //       0.4: 9.0,
  //       0.5: 11.3,
  //       0.6: 13.5,
  //       0.7: 15.8,
  //       0.8: 18.1,
  //       0.9: 20.3,
  //       1.0: 22.6,
  //     },
  //     1.1: {
  //       0.1: 2.3,
  //       0.2: 4.5,
  //       0.3: 6.8,
  //       0.4: 9.0,
  //       0.5: 11.3,
  //       0.6: 13.5,
  //       0.7: 15.8,
  //       0.8: 18.1,
  //       0.9: 20.3,
  //       1.0: 22.6,
  //     },
  //     1.2: {
  //       0.1: 2.3,
  //       0.2: 4.6,
  //       0.3: 6.9,
  //       0.4: 9.2,
  //       0.5: 11.4,
  //       0.6: 13.7,
  //       0.7: 16.0,
  //       0.8: 18.3,
  //       0.9: 20.6,
  //       1.0: 22.9,
  //     },
  //   };

  //   const profundidades = Object.keys(tablaValores).map(Number);
  //   const anchos = Object.keys(tablaValores[profundidades[0]]).map(Number);

  //   // Encontrar límites para profundidad y ancho de bulbo
  //   const limitesProfundidad = HelperService.encontrarLimites(
  //     profundidades,
  //     profundidad,
  //   );
  //   const limitesAncho = HelperService.encontrarLimites(anchos, anchoDeBulbo);

  //   if (!limitesProfundidad || !limitesAncho) {
  //     console.error('No se encontraron límites para la interpolación.');
  //     return null;
  //   }

  //   const [profMin, profMax] = limitesProfundidad;
  //   const [anchoMin, anchoMax] = limitesAncho;

  //   // Valores en los puntos extremos para interpolar
  //   const valorMinMin = tablaValores[profMin][anchoMin];
  //   const valorMinMax = tablaValores[profMin][anchoMax];
  //   const valorMaxMin = tablaValores[profMax][anchoMin];
  //   const valorMaxMax = tablaValores[profMax][anchoMax];

  //   // Interpolación en el eje del ancho de bulbo
  //   const valorInterpoladoMin = HelperService.interpolar(
  //     anchoDeBulbo,
  //     anchoMin,
  //     valorMinMin,
  //     anchoMax,
  //     valorMinMax,
  //   );
  //   const valorInterpoladoMax = HelperService.interpolar(
  //     anchoDeBulbo,
  //     anchoMin,
  //     valorMaxMin,
  //     anchoMax,
  //     valorMaxMax,
  //   );

  //   // Interpolación final en el eje de la profundidad
  //   return HelperService.interpolar(
  //     profundidad,
  //     profMin,
  //     valorInterpoladoMin,
  //     profMax,
  //     valorInterpoladoMax,
  //   );
  // }

  static getAguaUtilFacilmenteDisponible(
    profundidad: number,
    anchoDeBulbo: number,
    metrosLinealesHa: number,
    aguaUtil: number,
  ) {
    profundidad = profundidad / 100;
    // Logger.log(`Profundidad: ${profundidad}`);
    // Logger.log(`Ancho de bulbo: ${anchoDeBulbo}`);
    // Logger.log(`Metros lineales por Ha: ${metrosLinealesHa}`);
    // Logger.log(`Agua útil: ${aguaUtil}`);

    const result =
      anchoDeBulbo * profundidad * metrosLinealesHa * (aguaUtil / 10 / 100);
    return +result.toFixed(2);
  }

  // Función para interpolar un valor entre dos puntos
  static interpolar(
    x: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): number {
    return y1 + ((x - x1) * (y2 - y1)) / (x2 - x1);
  }

  // Función para encontrar el valor más cercano inferior y superior a un número
  static encontrarLimites(
    arr: number[],
    valor: number,
  ): [number, number] | null {
    arr.sort((a, b) => a - b);
    let menor = -1;
    let mayor = -1;

    for (let i = 0; i < arr.length; i++) {
      if (arr[i] <= valor) menor = arr[i];
      if (arr[i] >= valor) {
        mayor = arr[i];
        break;
      }
    }

    if (menor === -1 || mayor === -1) return null; // No se encontraron límites

    return [menor, mayor];
  }

  static getDiasDesdeEmergencia(
    crono: ICrono,
    fechaSiembra: Date,
    fechaActual: Date,
  ) {
    if (!crono) {
      Logger.warn('No se encontró crono');
      return 0;
    }
    let diasSiembraEmergencia;
    if (crono.cultivo === 'Maiz') {
      const etapas = crono.etapas as IEtapasMaiz;
      diasSiembraEmergencia = etapas.siembra_emergencia;
    }
    if (crono.cultivo === 'Soja') {
      const etapas = crono.etapas as IEtapasSoja;
      diasSiembraEmergencia = etapas.siembra_emergencia;
    }
    if (crono.cultivo === 'Trigo') {
      const etapas = crono.etapas as IEtapasTrigo;
      diasSiembraEmergencia = etapas.R0_R1;
    }

    const fechaEmergencia = fechaSiembra.setDate(
      fechaSiembra.getDate() + diasSiembraEmergencia,
    );
    const diasDesdeEmergencia = Math.floor(
      (fechaActual.getTime() - fechaEmergencia) / (1000 * 60 * 60 * 24),
    );
    return diasDesdeEmergencia;
  }

  static getHumedadSueloPorNivel(
    sonda: IClimaEstacionMeteorologica[],
    nivel: number,
  ) {
    const ultimo = sonda[sonda.length - 1];
    return ultimo.humedadSuelo[nivel]?.avg;
  }

  static getHumedadSuelo(sonda: IClimaEstacionMeteorologica[]) {
    const ultimo = sonda[sonda.length - 1];
    const cantidadNiveles = Object.keys(ultimo.humedadSuelo).length;
    const humedad = {};
    for (let i = 1; i <= cantidadNiveles; i++) {
      humedad[i] = HelperService.getHumedadSueloPorNivel(sonda, i);
    }
    return humedad;
  }

  static getEt0Promedio(
    pronostico7Dias: IPronosticoEstacionMeteorologica[],
  ): number {
    // Validar que el array sea válido
    if (
      !pronostico7Dias ||
      !Array.isArray(pronostico7Dias) ||
      pronostico7Dias.length === 0
    ) {
      console.warn('[getEt0Promedio] Array de pronóstico inválido o vacío');
      return 4.0; // Valor por defecto razonable para ET0
    }

    // Filtrar solo valores de ET0 válidos
    const et0Validos = pronostico7Dias
      .map((p) => p?.et0)
      .filter((et0) => typeof et0 === 'number' && !isNaN(et0) && et0 >= 0);

    if (et0Validos.length === 0) {
      console.warn(
        '[getEt0Promedio] No se encontraron valores ET0 válidos en el pronóstico. Verificar que MeteoSource esté enviando datos de evaporación.',
      );
      return 4.0; // Valor por defecto razonable para ET0
    }

    const prom =
      et0Validos.reduce((acc, et0) => acc + et0, 0) / et0Validos.length;
    const resultado = +prom.toFixed(2);

    console.log(
      `[getEt0Promedio] Calculado ET0 promedio: ${resultado} (de ${et0Validos.length}/${pronostico7Dias.length} valores válidos)`,
    );

    return resultado;
  }

  ///
  /**
   *
   * @param data Un objeto o array de datos que se desea verificar.
   * @returns true si es un array no vacío, false en caso contrario.
   */
  static arrayValido(data: any): boolean {
    // Primero verifica si es un array de verdad, luego si tiene elementos.
    return Array.isArray(data) && data.length > 0;
  }

  /**
   * Guarda un objeto de datos en un archivo JSON en la ruta especificada.
   * La función es asíncrona y crea el directorio si no existe.
   *
   * @param filePath La ruta completa del archivo donde se guardará el JSON (ej: 'data/usuarios.json').
   * @param data El objeto de JavaScript que se convertirá a JSON y se guardará.
   */
  static async guardarJson(
    filePath: string,
    data: Record<string, any>,
  ): Promise<void> {
    try {
      // 1. Convierte el objeto de JavaScript a una cadena JSON con formato legible.
      const jsonString = JSON.stringify(data, null, 2);

      // 2. Obtiene el nombre del directorio de la ruta del archivo.
      const dir = path.dirname(filePath);

      // 3. Asegura que el directorio exista, creándolo si es necesario.
      // El { recursive: true } permite crear carpetas anidadas (ej: 'data/v1/files').
      await fs.mkdir(dir, { recursive: true });

      // 4. Escribe la cadena JSON en el archivo.
      await fs.writeFile(filePath, jsonString, 'utf8');

      console.log(`✅ Archivo JSON guardado exitosamente en: ${filePath}`);
    } catch (error) {
      console.error('❌ Error al guardar el archivo JSON:', error);
      throw error; // Opcional: relanzar el error si quieres que el código que llama se entere.
    }
  }
}
