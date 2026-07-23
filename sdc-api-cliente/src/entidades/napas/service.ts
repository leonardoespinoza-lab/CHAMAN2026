import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import {
  CalidadReferenciaNapas,
  INapaPozoReferencia,
  INapaReferenciaLote,
} from 'modelos/src';

interface SiasPozoRaw {
  name?: string;
  codigoprovincial?: string;
  Provincia?: string;
  Departamento?: string;
  cuenca?: string;
  Uso?: string;
  fecha?: string;
  Profundidad?: string | number;
  NivelEstatico?: string | number;
  NivelDinamico?: string | number;
  Caudalmedio?: string | number;
  x?: number;
  y?: number;
  DuenioDelDato?: string;
}

interface NapaCache {
  expiresAt: number;
  pozos: INapaPozoReferencia[];
}

const SIAS_POZOS_URL =
  process.env.SIAS_POZOS_URL || 'https://cohife.org/SIAS/pozos.json';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const DEFAULT_RADIUS_KM = 80;
const MAX_RADIUS_KM = 180;

@Injectable()
export class NapasService {
  private readonly logger = new Logger(NapasService.name);
  private cache?: NapaCache;
  private pending?: Promise<INapaPozoReferencia[]>;

  constructor(private readonly http: HttpService) {}

  public async referenciaTerritorial(
    lat: number,
    lng: number,
    radioKm = DEFAULT_RADIUS_KM,
  ): Promise<INapaReferenciaLote> {
    const radio = this.limitarRadio(radioKm);
    const pozos = await this.getPozos();
    const conDistancia = pozos
      .map((pozo) => ({
        ...pozo,
        distanciaKm: this.round(
          this.distanciaKm(lat, lng, pozo.lat, pozo.lng),
          2,
        ),
      }))
      .sort((a, b) => a.distanciaKm - b.distanciaKm);

    const dentroRadio = conDistancia.filter(
      (pozo) => pozo.distanciaKm <= radio,
    );
    const muestra = (
      dentroRadio.length ? dentroRadio : conDistancia.slice(0, 18)
    ).slice(0, 18);
    const conNivel = muestra.filter((pozo) =>
      Number.isFinite(pozo.nivelEstaticoM),
    );
    const estadisticas = this.estadisticas(conNivel);
    const calidad = this.calidadReferencia(muestra, conNivel, estadisticas);
    const cobertura = {
      radioKm: radio,
      totalPozos: muestra.length,
      pozosConNivel: conNivel.length,
      distanciaMasCercanaKm: muestra[0]?.distanciaKm,
      distanciaMasCercanaConNivelKm: conNivel[0]?.distanciaKm,
      calidad,
      lectura: this.lectura(calidad, conNivel, estadisticas),
    };

    return {
      fuente: 'SIAS/COHIFE - red nacional de aguas subterraneas',
      fechaConsulta: new Date().toISOString(),
      cobertura,
      estadisticas,
      pozos: muestra,
      trazas: [
        `Fuente SIAS: ${SIAS_POZOS_URL}`,
        `Pozos normalizados en cache: ${pozos.length}`,
        dentroRadio.length
          ? `Se usaron pozos dentro de ${radio} km del lote.`
          : `Sin pozos dentro de ${radio} km; se muestran los mas cercanos como referencia.`,
        'Nivel estatico expresado como profundidad aproximada al agua bajo la superficie del terreno, segun el dato publicado por el duenio del dato.',
      ],
    };
  }

  private async getPozos(): Promise<INapaPozoReferencia[]> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.pozos;
    }
    if (this.pending) {
      return this.pending;
    }

    this.pending = firstValueFrom(
      this.http.get<SiasPozoRaw[]>(SIAS_POZOS_URL, { timeout: 30000 }),
    )
      .then((response) => {
        const data = Array.isArray(response.data) ? response.data : [];
        const pozos = data
          .map((item) => this.normalizarPozo(item))
          .filter((item): item is INapaPozoReferencia => !!item);
        this.cache = {
          expiresAt: Date.now() + CACHE_TTL_MS,
          pozos,
        };
        this.logger.log(`SIAS cargado: ${pozos.length} pozos normalizados`);
        return pozos;
      })
      .catch((error) => {
        this.logger.error(`No se pudo consultar SIAS: ${error.message}`);
        if (this.cache?.pozos?.length) {
          return this.cache.pozos;
        }
        throw error;
      })
      .finally(() => {
        this.pending = undefined;
      });

    return this.pending;
  }

  private normalizarPozo(raw: SiasPozoRaw): INapaPozoReferencia | undefined {
    const lat = Number(raw.y);
    const lng = Number(raw.x);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
    if (lat > -20 || lat < -60 || lng > -45 || lng < -75) return undefined;

    const nivelEstaticoM = this.toNumber(raw.NivelEstatico);
    return {
      id: raw.codigoprovincial || raw.name || `${lat}-${lng}`,
      nombre: raw.name,
      provincia: raw.Provincia,
      departamento: raw.Departamento,
      cuenca: raw.cuenca,
      uso: raw.Uso,
      fecha: this.normalizarFecha(raw.fecha),
      profundidadM: this.toNumber(raw.Profundidad),
      nivelEstaticoM,
      nivelDinamicoM: this.toNumber(raw.NivelDinamico),
      caudalMedio: this.toNumber(raw.Caudalmedio),
      lat,
      lng,
      distanciaKm: 0,
      fuente: raw.DuenioDelDato,
      tieneNivel: Number.isFinite(nivelEstaticoM),
    };
  }

  private estadisticas(
    pozos: INapaPozoReferencia[],
  ): INapaReferenciaLote['estadisticas'] {
    const niveles = pozos
      .map((pozo) => pozo.nivelEstaticoM)
      .filter((value): value is number => Number.isFinite(value))
      .sort((a, b) => a - b);
    const profundidades = pozos
      .map((pozo) => pozo.profundidadM)
      .filter((value): value is number => Number.isFinite(value));
    const fechas = pozos
      .map((pozo) => pozo.fecha)
      .filter((fecha): fecha is string => !!fecha)
      .sort();

    if (!niveles.length) return undefined;

    return {
      nivelEstaticoPromedioM: this.round(
        niveles.reduce((acc, value) => acc + value, 0) / niveles.length,
        2,
      ),
      nivelEstaticoMedianaM: this.round(this.mediana(niveles), 2),
      nivelEstaticoMinM: this.round(niveles[0], 2),
      nivelEstaticoMaxM: this.round(niveles[niveles.length - 1], 2),
      profundidadPromedioM: profundidades.length
        ? this.round(
            profundidades.reduce((acc, value) => acc + value, 0) /
              profundidades.length,
            2,
          )
        : undefined,
      fechaMasReciente: fechas[fechas.length - 1],
    };
  }

  private calidadReferencia(
    muestra: INapaPozoReferencia[],
    conNivel: INapaPozoReferencia[],
    estadisticas?: INapaReferenciaLote['estadisticas'],
  ): CalidadReferenciaNapas {
    if (!muestra.length || !conNivel.length) return 'sin_datos';
    const cercano = conNivel[0]?.distanciaKm || Infinity;
    const reciente = this.esReciente(estadisticas?.fechaMasReciente);
    if (conNivel.length >= 5 && cercano <= 25 && reciente) return 'alta';
    if (conNivel.length >= 3 && cercano <= 50) return 'media';
    return 'baja';
  }

  private lectura(
    calidad: CalidadReferenciaNapas,
    conNivel: INapaPozoReferencia[],
    estadisticas?: INapaReferenciaLote['estadisticas'],
  ): string {
    if (calidad === 'sin_datos') {
      return 'Sin niveles estaticos cercanos publicados; usar solo como busqueda de red y complementar con freatimetro propio.';
    }
    const mediana = estadisticas?.nivelEstaticoMedianaM;
    const distancia = conNivel[0]?.distanciaKm;
    const base =
      mediana !== undefined
        ? `Profundidad al agua de referencia ${mediana} m bajo la superficie del terreno`
        : 'Red con niveles estaticos disponibles';
    const cercania =
      distancia !== undefined
        ? `; pozo con nivel mas cercano a ${distancia} km`
        : '';
    if (calidad === 'alta') {
      return `${base}${cercania}. Buena cobertura territorial para seguimiento regional.`;
    }
    if (calidad === 'media') {
      return `${base}${cercania}. Referencia util, validar con topografia y freatimetro local.`;
    }
    return `${base}${cercania}. Cobertura baja o antigua: tomar como orientacion, no como medicion del lote.`;
  }

  private normalizarFecha(fecha?: string): string | undefined {
    if (!fecha) return undefined;
    const partes = fecha.split(/[-/]/).map((item) => Number(item));
    if (partes.length !== 3 || partes.some((item) => !Number.isFinite(item))) {
      return undefined;
    }
    const [dia, mes, anio] = partes;
    if (!dia || !mes || !anio) return undefined;
    return `${anio.toString().padStart(4, '0')}-${mes.toString().padStart(2, '0')}-${dia.toString().padStart(2, '0')}`;
  }

  private toNumber(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;
    const normalized = String(value).trim().replace(',', '.');
    if (!normalized || normalized.toUpperCase() === 'ND') return undefined;
    const numberValue = Number(normalized);
    return Number.isFinite(numberValue) ? numberValue : undefined;
  }

  private distanciaKm(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const earthKm = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) ** 2;
    return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private mediana(values: number[]): number {
    const mid = Math.floor(values.length / 2);
    return values.length % 2
      ? values[mid]
      : (values[mid - 1] + values[mid]) / 2;
  }

  private esReciente(fecha?: string): boolean {
    if (!fecha) return false;
    const year = Number(fecha.slice(0, 4));
    return Number.isFinite(year) && new Date().getFullYear() - year <= 12;
  }

  private limitarRadio(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return DEFAULT_RADIUS_KM;
    return Math.min(MAX_RADIUS_KM, Math.max(10, value));
  }

  private toRad(value: number): number {
    return (value * Math.PI) / 180;
  }

  private round(value: number, digits = 1): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }
}
