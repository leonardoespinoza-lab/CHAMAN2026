import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { IHuellaHidrica, ILote, ISiembra } from 'modelos/src';
import {
  calcularHuellaHidrica,
  DiaClimaHuella,
  getHuellaHidricaConstantes,
  HuellaHidricaParams,
  HuellaHidricaResultado,
} from './huella-hidrica.engine';

export interface AlgoritmoCatalogo {
  id: string;
  nombre: string;
  estado: 'operativo' | 'auditable' | 'configurable';
  descripcion: string;
  inputs: string[];
  outputs: string[];
}

@Injectable()
export class AlgoritmosService {
  private readonly logger = new Logger(AlgoritmosService.name);

  getCatalogo(): AlgoritmoCatalogo[] {
    return [
      {
        id: 'huella-hidrica',
        nombre: 'Huella hidrica',
        estado: 'operativo',
        descripcion:
          'Calcula huella verde, azul, gris y total al cosechar. Usa ETc/Kc, lluvia efectiva, fertilizaciones y fumigaciones.',
        inputs: [
          'Siembra: cultivo, fecha de siembra/cosecha, rendimiento seco, labranza, dosis N/P y manejo',
          'Lote: suelo, drenaje, pendiente, deposito N y contenido P',
          'Clima diario: precipitacion y ET0',
          'Fertilizaciones: dosis y composicion N/P',
          'Fumigaciones: principio activo, concentracion y dosis',
        ],
        outputs: ['litros/kg verde', 'litros/kg azul', 'litros/kg gris', 'litros/kg total', 'traza de calculo'],
      },
      {
        id: 'enfermedades',
        nombre: 'Prediccion de enfermedades',
        estado: 'auditable',
        descripcion:
          'Cruza susceptibilidad varietal, etapa fenologica, humedad persistente, lluvia y temperatura por cultivo.',
        inputs: ['Cultivo y variedad', 'Fenologia', 'Humedad relativa', 'Lluvia', 'Temperatura'],
        outputs: ['riesgo por enfermedad', 'periodo critico', 'prescripcion orientativa'],
      },
      {
        id: 'riego',
        nombre: 'Recomendacion de riego',
        estado: 'auditable',
        descripcion:
          'Combina humedad de suelo, capacidad de campo, punto de marchitez, ET0 y balance hidrico para recomendar riego.',
        inputs: ['Sensor de suelo', 'Suelo', 'ET0', 'Pronostico', 'Cultivo'],
        outputs: ['agua util', 'deficit', 'recomendacion'],
      },
      {
        id: 'satelite',
        nombre: 'Modulo satelital',
        estado: 'auditable',
        descripcion:
          'Procesa imagenes satelitales por lote y genera indices como NDVI, NDMI/NDWI, NDRE, SAVI y EVI.',
        inputs: ['Poligono del lote', 'Escena satelital', 'Nubosidad', 'Indice solicitado'],
        outputs: ['imagen recortada', 'promedio', 'serie temporal', 'lectura agronomica'],
      },
      {
        id: 'malezas',
        nombre: 'Prediccion de malezas',
        estado: 'auditable',
        descripcion:
          'Evalua emergencia de malezas para trigo, soja y maiz usando acumulacion termica/hidrica y parametros Gompertz.',
        inputs: ['Cultivo', 'Temperatura', 'Humedad/lluvia', 'Parametros por especie'],
        outputs: ['probabilidad de emergencia', 'ventana de control', 'curva estimada'],
      },
    ];
  }

  getParametrosHuellaHidrica() {
    return getHuellaHidricaConstantes();
  }

  simularHuellaHidrica(params: HuellaHidricaParams): HuellaHidricaResultado {
    return calcularHuellaHidrica(params);
  }

  async calcularHuellaHidricaReal(params: Omit<HuellaHidricaParams, 'clima'>): Promise<HuellaHidricaResultado> {
    const lote = params.lote;
    const siembra = params.siembra;
    const lat = lote.ubicacion?.centro?.lat;
    const lng = lote.ubicacion?.centro?.lng;
    if (lat == null || lng == null) {
      throw new BadRequestException('No se puede calcular huella hidrica: el lote no tiene centro geografico.');
    }
    if (!siembra.fechaSiembra || !siembra.fechaCosecha) {
      throw new BadRequestException('No se puede calcular huella hidrica: faltan fechas de siembra o cosecha.');
    }
    const clima = await this.getClimaOpenMeteo(lat, lng, siembra.fechaSiembra, siembra.fechaCosecha);
    return calcularHuellaHidrica({ ...params, clima });
  }

  calcularHumedadSeca(rendimientoKgHa?: number, humedadCosecha?: number): number {
    const rendimiento = Number(rendimientoKgHa || 0);
    const humedad = Number(humedadCosecha || 0);
    if (rendimiento <= 0) return 0;
    return Math.round(rendimiento * (100 / (100 + humedad)) * 100) / 100;
  }

  private async getClimaOpenMeteo(
    lat: number,
    lng: number,
    fechaDesde: string,
    fechaHasta: string,
  ): Promise<DiaClimaHuella[]> {
    const desde = this.toDateKey(fechaDesde);
    const hasta = this.toDateKey(fechaHasta);
    if (desde > hasta) {
      throw new BadRequestException('La fecha de cosecha no puede ser anterior a la fecha de siembra.');
    }

    const hoy = this.toDateKey(new Date().toISOString());
    const ayer = this.shiftDateKey(hoy, -1);
    const resultados: DiaClimaHuella[] = [];

    if (desde <= ayer) {
      const end = hasta < ayer ? hasta : ayer;
      resultados.push(...(await this.fetchOpenMeteo('archive', lat, lng, desde, end)));
    }
    if (hasta >= hoy) {
      const start = desde > hoy ? desde : hoy;
      resultados.push(...(await this.fetchOpenMeteo('forecast', lat, lng, start, hasta)));
    }

    return resultados.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  private async fetchOpenMeteo(
    tipo: 'archive' | 'forecast',
    lat: number,
    lng: number,
    desde: string,
    hasta: string,
  ): Promise<DiaClimaHuella[]> {
    if (desde > hasta) return [];
    const base =
      tipo === 'archive'
        ? 'https://archive-api.open-meteo.com/v1/archive'
        : 'https://api.open-meteo.com/v1/forecast';
    const url = new URL(base);
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lng));
    url.searchParams.set('start_date', desde);
    url.searchParams.set('end_date', hasta);
    url.searchParams.set('daily', 'precipitation_sum,et0_fao_evapotranspiration');
    url.searchParams.set('timezone', 'America/Argentina/Buenos_Aires');

    try {
      const { data } = await axios.get(url.toString(), { timeout: 15000 });
      const fechas: string[] = data?.daily?.time || [];
      const lluvias: number[] = data?.daily?.precipitation_sum || [];
      const et0: number[] = data?.daily?.et0_fao_evapotranspiration || [];
      return fechas.map((fecha, index) => ({
        fecha,
        lluviaMm: Number(lluvias[index] || 0),
        et0Mm: Number(et0[index] || 0),
      }));
    } catch (error) {
      this.logger.error(`Error Open-Meteo ${tipo} ${desde}/${hasta}: ${error}`);
      throw new BadRequestException('No se pudo obtener clima Open-Meteo para calcular la huella hidrica.');
    }
  }

  private toDateKey(fecha: string): string {
    return new Date(fecha).toISOString().slice(0, 10);
  }

  private shiftDateKey(fecha: string, dias: number): string {
    const date = new Date(`${fecha}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + dias);
    return date.toISOString().slice(0, 10);
  }
}
