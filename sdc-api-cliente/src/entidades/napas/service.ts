import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import {
  CalidadReferenciaNapas,
  IDispositivo,
  ILote,
  INapaPozoReferencia,
  INapaReferenciaLote,
  INapaSeguimientoLote,
  IPermiso,
  IServicioDispositivo,
  serviciosDispositivoNormalizados,
} from 'modelos/src';
import { LotesService } from '../lote/service';

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
const SENSOR_CURRENT_HOURS = (() => {
  const configured = Number(process.env.NAPA_SENSOR_CURRENT_HOURS);
  return Number.isFinite(configured) && configured > 0 ? configured : 2;
})();
const SENSOR_MAX_AGE_HOURS = (() => {
  const configured = Number(process.env.NAPA_SENSOR_MAX_AGE_HOURS);
  return Number.isFinite(configured) && configured > 0 ? configured : 24;
})();
const SENSOR_CURRENT_MS = SENSOR_CURRENT_HOURS * 60 * 60 * 1000;
const SENSOR_MAX_AGE_MS = SENSOR_MAX_AGE_HOURS * 60 * 60 * 1000;
const NEARBY_MAX_DISTANCE_KM = (() => {
  const configured = Number(process.env.NAPA_NEARBY_MAX_DISTANCE_KM);
  return Number.isFinite(configured) && configured > 0 ? configured : 10;
})();
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_VISIBLE_LOTS = 1000;
const MAX_NEARBY_LOTS_TO_FETCH = 12;

interface SensorNapaObservation {
  nivelM: number;
  fechaMedicion: string;
  fechaRecepcion?: string;
  edadMinutos: number;
  frescura: 'actual' | 'demorada' | 'vencida';
  columnaAguaM?: number;
  profundidadInstalacionM?: number;
  origen: {
    fuente: 'Milesight/LoRaWAN';
    servicio: 'nivel-napa';
    lote: string;
    fabricante?: string;
    modelo?: string;
    fCnt?: number;
    decoderId?: string;
    decoderVersion?: string;
    conversionModel?: 'lineal-4-20ma-v1';
  };
}

@Injectable()
export class NapasService {
  private readonly logger = new Logger(NapasService.name);
  private cache?: NapaCache;
  private pending?: Promise<INapaPozoReferencia[]>;

  constructor(
    private readonly http: HttpService,
    private readonly lotes: LotesService,
  ) {}

  /**
   * Resuelve una unica fuente principal para la tarjeta. La consulta esta
   * anclada a un lote autorizado y nunca retorna inventario fisico, DevEUI,
   * payloads ni coordenadas del sensor de referencia.
   */
  public async seguimientoLote(
    idLote: string,
    permiso: IPermiso,
  ): Promise<INapaSeguimientoLote> {
    const lote = await this.lotes.getById(idLote, permiso);
    const fechaConsulta = new Date().toISOString();
    let motivoFallback = 'El lote no tiene una medicion de napa disponible.';

    if (permiso?.modulos?.Sensores !== false) {
      const propias = this.medicionesDeLote(lote, idLote);
      const propiaVigente = propias
        .filter((item) => item.frescura !== 'vencida')
        .sort(
          (left, right) =>
            Date.parse(right.fechaMedicion) - Date.parse(left.fechaMedicion),
        )[0];
      if (propiaVigente) {
        const demorada = propiaVigente.frescura === 'demorada';
        return {
          tipo: 'sensor_lote',
          fechaConsulta,
          mensaje: demorada
            ? `Medicion directa del lote demorada; la ultima lectura tiene mas de ${SENSOR_CURRENT_HOURS} horas.`
            : 'Medicion directa del sensor instalado en este lote.',
          nivelM: propiaVigente.nivelM,
          unidad: 'm',
          referencia: 'nivel_terreno',
          fechaMedicion: propiaVigente.fechaMedicion,
          fechaRecepcion: propiaVigente.fechaRecepcion,
          frescura: propiaVigente.frescura === 'actual' ? 'actual' : 'demorada',
          edadMinutos: propiaVigente.edadMinutos,
          columnaAguaM: propiaVigente.columnaAguaM,
          profundidadInstalacionM: propiaVigente.profundidadInstalacionM,
          distanciaKm: 0,
          origen: propiaVigente.origen,
        };
      }

      if (propias.length) {
        motivoFallback = `La medicion propia tiene mas de ${SENSOR_MAX_AGE_HOURS} horas.`;
      }

      const cercana = await this.medicionCercana(lote, idLote, permiso);
      if (cercana) {
        return {
          tipo: 'sensor_cercano',
          fechaConsulta,
          mensaje:
            'Referencia de un sensor cercano del mismo productor y establecimiento; no es una medicion del lote.',
          nivelM: cercana.observacion.nivelM,
          unidad: 'm',
          referencia: 'nivel_terreno',
          fechaMedicion: cercana.observacion.fechaMedicion,
          fechaRecepcion: cercana.observacion.fechaRecepcion,
          frescura: 'actual',
          edadMinutos: cercana.observacion.edadMinutos,
          columnaAguaM: cercana.observacion.columnaAguaM,
          profundidadInstalacionM: cercana.observacion.profundidadInstalacionM,
          distanciaKm: cercana.distanciaKm,
          origen: cercana.observacion.origen,
        };
      }
    } else {
      motivoFallback = 'El permiso activo no habilita datos de sensores.';
    }

    return await this.referenciaSiasParaTarjeta(
      lote,
      fechaConsulta,
      motivoFallback,
    );
  }

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

  private medicionesDeLote(
    lote: ILote,
    idLote: string,
  ): SensorNapaObservation[] {
    const dispositivos = (lote.dispositivos || []) as IDispositivo[];
    return dispositivos.flatMap((dispositivo) =>
      serviciosDispositivoNormalizados(dispositivo)
        .filter((servicio) =>
          this.servicioPerteneceAlLote(servicio, dispositivo, lote, idLote),
        )
        .map((servicio) =>
          this.extraerObservacionSensor(
            dispositivo,
            servicio,
            lote.nombre || 'Este lote',
          ),
        )
        .filter((item): item is SensorNapaObservation => item !== undefined),
    );
  }

  private async medicionCercana(
    lote: ILote,
    idLote: string,
    permiso: IPermiso,
  ): Promise<
    { observacion: SensorNapaObservation; distanciaKm: number } | undefined
  > {
    const productor = this.relacionId(lote.idProductor);
    const establecimiento = this.relacionId(lote.idEstablecimiento);
    const coordenadasObjetivo = this.coordenadasLote(lote);
    if (!productor || !establecimiento || !coordenadasObjetivo) {
      return undefined;
    }

    let lotesVisibles: ILote[] = [];
    try {
      const listado = await this.lotes.get(
        {
          filter: JSON.stringify({
            idProductor: productor,
            idEstablecimiento: establecimiento,
            archivado: { $ne: true },
          }),
          limit: MAX_VISIBLE_LOTS,
          sort: 'nombre',
        },
        permiso,
      );
      lotesVisibles = listado.datos || [];
    } catch (error) {
      this.logger.warn(
        `No se pudieron resolver lotes visibles para napas: ${error?.message || error}`,
      );
      return undefined;
    }

    const candidatos = lotesVisibles
      .map((candidato) => {
        const id = this.relacionId(candidato._id);
        const coordenadas = this.coordenadasLote(candidato);
        if (
          !id ||
          id === this.relacionId(idLote) ||
          !coordenadas ||
          this.relacionId(candidato.idProductor) !== productor ||
          this.relacionId(candidato.idEstablecimiento) !== establecimiento
        ) {
          return undefined;
        }
        const distanciaKm = this.round(
          this.distanciaKm(
            coordenadasObjetivo.lat,
            coordenadasObjetivo.lng,
            coordenadas.lat,
            coordenadas.lng,
          ),
          2,
        );
        return distanciaKm <= NEARBY_MAX_DISTANCE_KM
          ? { id, distanciaKm }
          : undefined;
      })
      .filter(
        (
          item,
        ): item is {
          id: string;
          distanciaKm: number;
        } => item !== undefined,
      )
      .sort((left, right) => left.distanciaKm - right.distanciaKm)
      .slice(0, MAX_NEARBY_LOTS_TO_FETCH);

    for (const candidato of candidatos) {
      let loteFuente: ILote;
      try {
        loteFuente = await this.lotes.getById(candidato.id, permiso);
      } catch {
        continue;
      }
      if (
        this.relacionId(loteFuente.idProductor) !== productor ||
        this.relacionId(loteFuente.idEstablecimiento) !== establecimiento
      ) {
        continue;
      }
      const observacion = this.medicionesDeLote(loteFuente, candidato.id)
        .filter((item) => item.frescura === 'actual')
        .sort(
          (left, right) =>
            Date.parse(right.fechaMedicion) - Date.parse(left.fechaMedicion),
        )[0];
      if (observacion) {
        return {
          observacion,
          distanciaKm: candidato.distanciaKm,
        };
      }
    }

    return undefined;
  }

  private servicioPerteneceAlLote(
    servicio: IServicioDispositivo,
    dispositivo: IDispositivo,
    lote: ILote,
    idLote: string,
  ): boolean {
    const idServicioLote = this.relacionId(
      servicio.idLote || dispositivo.idLote,
    );
    const productorServicio = this.relacionId(
      servicio.idProductor || dispositivo.idProductor,
    );
    const establecimientoServicio = this.relacionId(
      servicio.idEstablecimiento || dispositivo.idEstablecimiento,
    );
    const productorLote = this.relacionId(lote.idProductor);
    const establecimientoLote = this.relacionId(lote.idEstablecimiento);

    return (
      servicio.tipo === 'nivel_napa' &&
      idServicioLote === this.relacionId(idLote) &&
      productorServicio === productorLote &&
      establecimientoServicio === establecimientoLote
    );
  }

  private extraerObservacionSensor(
    dispositivo: IDispositivo,
    servicio: IServicioDispositivo,
    nombreLote: string,
  ): SensorNapaObservation | undefined {
    const reporte = dispositivo.ultimoReporte;
    const rows = reporte?.datos?.valores?.Napa || [];
    const row = rows.find(
      (item) =>
        typeof item?.valores?.actual === 'number' &&
        Number.isFinite(item.valores.actual),
    );
    const nivelM = row?.valores?.actual;
    const unidad = String(
      row?.unidad ||
        dispositivo.configuracionLecturas?.entradaAnalogica?.unidadSalida ||
        '',
    )
      .trim()
      .toLowerCase();
    if (
      !row ||
      typeof nivelM !== 'number' ||
      !Number.isFinite(nivelM) ||
      nivelM < 0 ||
      !['m', 'metro', 'metros'].includes(unidad)
    ) {
      return undefined;
    }

    const metadata = reporte?.metadataLora;
    const fecha = metadata?.cycleFirstTimestamp || reporte?.fechaCreacion;
    const timestamp = fecha ? Date.parse(fecha) : Number.NaN;
    const now = Date.now();
    if (!Number.isFinite(timestamp) || timestamp > now + MAX_FUTURE_SKEW_MS) {
      return undefined;
    }
    const fechaAsignacion = servicio.fechaAsignacionLote
      ? Date.parse(servicio.fechaAsignacionLote)
      : Number.NaN;
    const servicioExplicito = servicio.fuente !== 'inferido';
    if (
      (servicioExplicito && !Number.isFinite(fechaAsignacion)) ||
      (Number.isFinite(fechaAsignacion) && timestamp < fechaAsignacion)
    ) {
      return undefined;
    }

    const profundidadInstalacionM = this.numeroPositivo(
      row.valores?.profundidadInstalacion ??
        dispositivo.configuracionLecturas?.entradaAnalogica
          ?.profundidadInstalacionM,
    );
    if (
      profundidadInstalacionM !== undefined &&
      nivelM > profundidadInstalacionM + 0.05
    ) {
      return undefined;
    }
    const columnaPublicadaM = this.numeroNoNegativo(row.valores?.columnaAgua);
    let columnaAguaM = columnaPublicadaM;
    if (profundidadInstalacionM !== undefined) {
      const columnaCalculadaM = this.round(
        Math.max(0, profundidadInstalacionM - nivelM),
        3,
      );
      if (
        columnaPublicadaM !== undefined &&
        Math.abs(columnaPublicadaM - columnaCalculadaM) > 0.05
      ) {
        return undefined;
      }
      columnaAguaM = columnaPublicadaM ?? columnaCalculadaM;
    }
    const edadMs = Math.max(0, now - timestamp);
    const conversionModel =
      dispositivo.configuracionLecturas?.entradaAnalogica?.versionConversion ===
      'lineal-4-20ma-v1'
        ? 'lineal-4-20ma-v1'
        : undefined;

    return {
      nivelM,
      fechaMedicion: new Date(timestamp).toISOString(),
      fechaRecepcion: this.fechaIsoValida(reporte?.fechaCreacion),
      edadMinutos: this.round(edadMs / 60_000, 1),
      frescura:
        edadMs <= SENSOR_CURRENT_MS
          ? 'actual'
          : edadMs <= SENSOR_MAX_AGE_MS
            ? 'demorada'
            : 'vencida',
      columnaAguaM,
      profundidadInstalacionM,
      origen: {
        fuente: 'Milesight/LoRaWAN',
        servicio: 'nivel-napa',
        lote: nombreLote,
        fabricante: metadata?.controllerManufacturer || 'Milesight',
        modelo: metadata?.controllerModel,
        fCnt: metadata?.cycleFirstFCnt,
        decoderId: metadata?.payloadDecoderId,
        decoderVersion: metadata?.payloadDecoderVersion,
        conversionModel,
      },
    };
  }

  private async referenciaSiasParaTarjeta(
    lote: ILote,
    fechaConsulta: string,
    motivoFallback: string,
  ): Promise<INapaSeguimientoLote> {
    const coordenadas = this.coordenadasLote(lote);
    let referencia: INapaReferenciaLote | undefined;
    if (coordenadas) {
      try {
        referencia = await this.referenciaTerritorial(
          coordenadas.lat,
          coordenadas.lng,
          DEFAULT_RADIUS_KM,
        );
      } catch (error) {
        this.logger.warn(
          `Referencia SIAS no disponible para lote: ${error?.message || error}`,
        );
      }
    }

    const cobertura = referencia?.cobertura || {
      radioKm: DEFAULT_RADIUS_KM,
      totalPozos: 0,
      pozosConNivel: 0,
      calidad: 'sin_datos' as const,
      lectura:
        'Sin referencia territorial disponible; se requiere una medicion local.',
    };
    const nivelM = referencia?.estadisticas?.nivelEstaticoMedianaM;
    return {
      tipo: 'sias',
      fechaConsulta,
      mensaje: `${motivoFallback} Se muestra SIAS solo como referencia territorial; no es una medicion del lote.`,
      nivelM,
      unidad: 'm',
      referencia: 'nivel_terreno',
      fechaMedicion: referencia?.estadisticas?.fechaMasReciente,
      frescura: Number.isFinite(nivelM) ? 'territorial' : 'sin_datos',
      fuente: 'SIAS/COHIFE',
      cobertura,
      estadisticas: referencia?.estadisticas,
    };
  }

  private coordenadasLote(
    lote: ILote,
  ): { lat: number; lng: number } | undefined {
    const lat = Number(lote?.ubicacion?.centro?.lat);
    const lng = Number(lote?.ubicacion?.centro?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng)
      ? { lat, lng }
      : undefined;
  }

  private relacionId(value: unknown): string {
    if (value && typeof value === 'object' && '_id' in (value as object)) {
      return String((value as { _id?: unknown })._id || '');
    }
    return String(value || '');
  }

  private numeroPositivo(value: unknown): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  private numeroNoNegativo(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? value
      : undefined;
  }

  private fechaIsoValida(value?: string): string | undefined {
    if (!value) return undefined;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp)
      ? new Date(timestamp).toISOString()
      : undefined;
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
