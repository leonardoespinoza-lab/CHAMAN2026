import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import {
  IEstablecimiento,
  IListado,
  IQueryParam,
  ICreateEstablecimiento,
  IUpdateEstablecimiento,
  IFilter,
  IPermiso,
  IClimaEstacionMeteorologica,
  IEstacion,
  IEstacionLecturaHistorica,
  IEstacionLecturaDetalle,
  IValores,
  IUsuario,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { EstablecimientosRepository } from './repository';
import { ClimaRepository } from '../clima/repository';
import { ProductorsService } from '../productor/service';
import { CLIMA_CACHE_TTL_MINUTES } from '../../env';
import { EstacionsService } from '../estacion/service';
import {
  protectFieldClimateCredential,
  revealFieldClimateCredential,
} from '../../auxiliares/fieldclimate-credentials';
import { fieldClimateStatus } from '../../auxiliares/fieldclimate-status';
import { DecisionPipelineQueueService } from '../../auxiliares/decision-pipeline';
import {
  establecimientosDelPermiso,
  permisoPuedeVerEstablecimiento,
} from '../../auxiliares/authorization/alcance-permiso';
import { LotesRepository } from '../lote/repository';

@Injectable()
export class EstablecimientosService {
  private readonly logger = new Logger(EstablecimientosService.name);
  private readonly pronosticoPendiente = new Map<string, Promise<void>>();
  private readonly climaPendiente = new Map<string, Promise<void>>();

  constructor(
    private repository: EstablecimientosRepository,
    private climaRepository: ClimaRepository,
    private productorsService: ProductorsService,
    private estacionsService: EstacionsService,
    @Optional()
    private readonly decisionPipelineQueue?: DecisionPipelineQueueService,
    @Optional()
    private readonly lotesRepository?: LotesRepository,
  ) {}

  async getById(id: string, permiso: IPermiso): Promise<IEstablecimiento> {
    const res = await this.repository.getById(id);
    if (!this.puedeVer(res, permiso)) {
      throw new BadRequestException(
        'No tiene permiso para ver este establecimiento',
      );
    }
    await Promise.all([this.checkPronostico(res), this.checkClima(res)]);
    return res;
  }

  async get(
    query: IQueryParam,
    permiso: IPermiso,
  ): Promise<IListado<IEstablecimiento>> {
    this.agregarFiltroPermiso(query, permiso);
    const res = await this.repository.get(query);
    await Promise.all(
      res.datos.map(async (est) => {
        await Promise.all([this.checkPronostico(est), this.checkClima(est)]);
      }),
    );
    return res;
  }

  async create(
    data: ICreateEstablecimiento,
    permiso: IPermiso,
  ): Promise<IEstablecimiento> {
    if (permiso.nivel === 'Asesor') {
      throw new BadRequestException(
        'El asesor gestiona productores; los establecimientos los crea el usuario productor',
      );
    }
    data = this.withoutAutomaticLocation(data);
    if (data.ubicacion?.length) {
      for (const u of data.ubicacion) {
        if (u.poligono?.length && !u.geojson) {
          u.geojson = {
            type: 'Polygon',
            coordinates: [HelperService.polyToGeojson(u.poligono)],
          };
        }
      }
    }
    if (!data.idProductor) {
      data.idProductor = permiso.idProductor;
    }
    const productor = await this.productorsService.getById(
      data.idProductor,
      permiso,
    );
    data.idDistribuidor = productor.idDistribuidor;
    data.idQuimica = productor.idQuimica;
    (data as ICreateEstablecimiento & { idTenant?: string }).idTenant =
      productor.idTenant;
    (
      data as ICreateEstablecimiento & { idAsesorPropietario?: string }
    ).idAsesorPropietario = productor.idAsesorPropietario;
    if (!this.puedeVer(data, permiso)) {
      throw new BadRequestException(
        'No tiene permiso para crear este establecimiento',
      );
    }
    return await this.repository.create(data);
  }

  async update(
    id: string,
    data: IUpdateEstablecimiento,
    permiso: IPermiso,
  ): Promise<IEstablecimiento> {
    if (permiso.nivel === 'Asesor') {
      throw new BadRequestException(
        'El asesor tiene acceso de supervision; la edicion corresponde al usuario productor',
      );
    }
    data = this.withoutAutomaticLocation(data);
    await this.getById(id, permiso);
    if (data.ubicacion?.length) {
      for (const u of data.ubicacion) {
        if (u.poligono?.length) {
          u.geojson = {
            type: 'Polygon',
            coordinates: [HelperService.polyToGeojson(u.poligono)],
          };
        }
      }
    }
    if (!this.puedeVer(data, permiso)) {
      throw new BadRequestException(
        'No tiene permiso para actualizar este establecimiento',
      );
    }
    const updated = await this.repository.update(id, data);
    const changedFields = [
      'idEstacionMeteorologica',
      'ubicacion',
      'fuenteClimaPreferida',
    ].filter((field) => Object.prototype.hasOwnProperty.call(data, field));
    if (changedFields.length) {
      if (this.decisionPipelineQueue) {
        await this.decisionPipelineQueue.enqueueForEstablishment(id, {
          trigger: 'establecimiento.weather-source-updated',
          changedFields,
          sincronizarClima: true,
        });
      } else {
        await this.repository.reprocesarAgrometeorologia(id);
      }
    }
    return updated;
  }

  async delete(
    id: string,
    permiso: IPermiso,
    actor?: IUsuario,
  ): Promise<IEstablecimiento> {
    if (permiso.nivel === 'Asesor') {
      throw new BadRequestException(
        'El asesor tiene acceso de supervision; la eliminacion corresponde al usuario productor',
      );
    }
    await this.getById(id, permiso);
    const audit = {
      archivadoPor: actor?.username || actor?._id || 'sistema',
      motivoArchivado: 'Establecimiento archivado desde Chaman',
    };
    const lotes = await this.lotesRepository?.get({
      page: 0,
      limit: 0,
      filter: JSON.stringify({ idEstablecimiento: id }),
      select: '_id',
    });
    await Promise.all(
      (lotes?.datos || []).map((item) =>
        this.lotesRepository!.delete(String(item._id), audit),
      ),
    );
    return await this.repository.delete(id, audit);
  }

  async refreshClimaDeEstablecimientos(): Promise<{
    total: number;
    actualizados: number;
    errores: number;
  }> {
    let page = 0;
    const limit = 100;
    let total = 0;
    let actualizados = 0;
    let errores = 0;

    while (true) {
      const res = await this.repository.get({
        page,
        limit,
        select:
          'nombre ubicacion climaActual prediccionClimatica idEstacionMeteorologica fuenteClimaPreferida',
      });
      const establecimientos = res.datos || [];
      total = res.totalCount || total;
      if (!establecimientos.length) {
        break;
      }

      for (const est of establecimientos) {
        try {
          await this.checkPronostico(est);
          await this.checkClima(est);
          actualizados += 1;
        } catch (error) {
          errores += 1;
          Logger.error(`Error refrescando clima de establecimiento ${est._id}`);
          console.error(error);
        }
      }

      if (establecimientos.length < limit || (page + 1) * limit >= total) {
        break;
      }
      page += 1;
    }

    return { total, actualizados, errores };
  }

  // Private

  private async checkPronostico(est: IEstablecimiento) {
    return this.ejecutarUnaVez(
      this.pronosticoPendiente,
      this.cacheKeyClima(est, 'pronostico'),
      () => this.checkPronosticoInterno(est),
    );
  }

  private async checkPronosticoInterno(est: IEstablecimiento) {
    try {
      const vencido = this.vencido(
        est.prediccionClimatica?.fecha,
        CLIMA_CACHE_TTL_MINUTES,
      );
      const pronosticos = est.prediccionClimatica?.pronosticos;
      if (!pronosticos?.length || vencido) {
        const centro = est.ubicacion?.[0]?.centro;
        if (!centro?.lat || !centro?.lng) {
          Logger.error(
            'No se puede obtener el pronostico, lat o lng no definidos',
          );
          return;
        }
        const pronosticos = await this.climaRepository.getPronostico(
          centro.lat,
          centro.lng,
        );
        if (!pronosticos?.length) {
          Logger.warn(
            `No se obtuvo pronostico para establecimiento ${est._id}; se conserva el cache existente`,
          );
          return;
        }
        const fecha = new Date().toISOString();
        const prediccionClimatica = {
          fecha,
          pronosticos,
        };
        est.prediccionClimatica = prediccionClimatica || {};
        // update el pronostico en la base de datos
        await this.repository.update(est._id, {
          prediccionClimatica,
        });
      }
    } catch (error) {
      Logger.error('Error al obtener el pronostico climatologico');
      console.error(error);
    }
  }

  private async checkClima(est: IEstablecimiento) {
    return this.ejecutarUnaVez(
      this.climaPendiente,
      this.cacheKeyClima(est, 'actual'),
      () => this.checkClimaInterno(est),
    );
  }

  private async checkClimaInterno(est: IEstablecimiento) {
    try {
      const vencido = this.vencido(
        est.climaActual?.fecha,
        CLIMA_CACHE_TTL_MINUTES,
      );
      const clima = est.climaActual?.clima;
      if (!clima || vencido) {
        const centro = est.ubicacion?.[0]?.centro;
        if (!centro?.lat || !centro?.lng) {
          Logger.error('No se puede obtener el clima, lat o lng no definidos');
          return;
        }
        const climaCentral = await this.getClimaActualFieldClimate(est);
        let clima = climaCentral;
        if (!clima) {
          const climaRespuesta = await this.climaRepository.getClima(
            centro.lat,
            centro.lng,
          );
          clima = Array.isArray(climaRespuesta)
            ? climaRespuesta[climaRespuesta.length - 1]
            : climaRespuesta;
        }
        const climaSeleccionado = clima;
        if (!climaSeleccionado) {
          Logger.warn(
            `No se obtuvo clima actual para establecimiento ${est._id}`,
          );
          return;
        }
        const fecha = new Date().toISOString();
        const climaActual = {
          fecha,
          clima: climaSeleccionado,
        };
        est.climaActual = climaActual || {};
        // update el pronostico en la base de datos
        await this.repository.update(est._id, {
          climaActual,
        });
      }
    } catch (error) {
      Logger.error('Error al obtener el clima actual');
      console.error(error);
    }
  }

  private ejecutarUnaVez(
    mapa: Map<string, Promise<void>>,
    key: string,
    tarea: () => Promise<void>,
  ): Promise<void> {
    const pendiente = mapa.get(key);
    if (pendiente) {
      return pendiente;
    }

    const promesa = tarea().finally(() => mapa.delete(key));
    mapa.set(key, promesa);
    return promesa;
  }

  private cacheKeyClima(
    est: IEstablecimiento,
    tipo: 'actual' | 'pronostico',
  ): string {
    const centro = est.ubicacion?.[0]?.centro;
    const lat = centro?.lat;
    const lng = centro?.lng;
    const ubicacion =
      lat !== undefined && lat !== null && lng !== undefined && lng !== null
        ? `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`
        : est._id;
    return `${tipo}:${ubicacion}`;
  }

  private async getClimaActualFieldClimate(
    est: IEstablecimiento,
  ): Promise<IClimaEstacionMeteorologica | null> {
    if (est.fuenteClimaPreferida !== 'FieldClimate') {
      return null;
    }
    let central: IEstacion | null = null;
    try {
      central = await this.getCentralFieldClimate(est);
      if (!central?.idExterno || !central.user || !central.pass) {
        return null;
      }
      const username = revealFieldClimateCredential(central.user);
      const password = revealFieldClimateCredential(central.pass);
      const data = await this.climaRepository.getFieldClimateLastData(
        central.idExterno,
        username,
        password,
      );
      await this.actualizarCentralFieldClimateDetalle(central, data);
      return this.normalizarFieldClimateActual(central, data);
    } catch (error) {
      if (central?._id) {
        const status = Number(
          (error as any)?.status || (error as any)?.response?.status || 0,
        );
        await this.estacionsService
          .update(central._id, {
            estado: {
              ...central.estado,
              activa: central.estado?.activa !== false,
              ultimoSync: new Date().toISOString(),
              ultimoError:
                status === 401 || status === 403
                  ? 'Credenciales FieldClimate rechazadas'
                  : 'No se pudo consultar FieldClimate',
              reportando: false,
              conexion:
                status === 401 || status === 403
                  ? 'error_autenticacion'
                  : 'error',
            },
          })
          .catch(() => undefined);
      }
      Logger.warn(
        `No se pudo usar FieldClimate para establecimiento ${est._id}; se usa respaldo Open-Meteo`,
      );
      return null;
    }
  }

  private async getCentralFieldClimate(
    est: IEstablecimiento,
  ): Promise<IEstacion | null> {
    if (est.idEstacionMeteorologica) {
      return await this.estacionsService.getById(est.idEstacionMeteorologica);
    }

    const centrales = await this.estacionsService.getFiltered({
      filter: JSON.stringify({
        idEstablecimiento: est._id,
        origen: 'FieldClimate',
        'estado.activa': { $ne: false },
      }),
      limit: 1,
      sort: '-estado.ultimoSync',
    });

    return centrales?.datos?.[0] || null;
  }

  private normalizarFieldClimateActual(
    central: IEstacion,
    data: any,
  ): IClimaEstacionMeteorologica | null {
    const dates = data?.dates || [];
    const lastIndex = this.indiceUltimaFecha(dates);
    if (lastIndex < 0 || !Array.isArray(data?.data)) {
      return null;
    }
    const status = fieldClimateStatus(String(dates[lastIndex] || ''));
    if (!status.reportando) {
      Logger.warn(
        `FieldClimate sin lectura reciente para central ${central.idExterno}; se usa respaldo Open-Meteo`,
      );
      return null;
    }
    const lectura = (
      matcher: (name: string) => boolean,
      preferencia: (name: string) => number = () => 0,
    ): IValores | undefined => {
      const serie = data.data
        .filter((item) => {
          const name = String(
            item?.name || item?.name_original || '',
          ).toLowerCase();
          return matcher(name);
        })
        .sort((a, b) => {
          const nameA = String(a?.name || a?.name_original || '').toLowerCase();
          const nameB = String(b?.name || b?.name_original || '').toLowerCase();
          return preferencia(nameB) - preferencia(nameA);
        })[0];
      if (!serie?.values) {
        return undefined;
      }
      return {
        avg: this.valorSerie(serie.values.avg, lastIndex),
        min: this.valorSerie(serie.values.min, lastIndex),
        max: this.valorSerie(serie.values.max, lastIndex),
        sum: this.valorSerie(serie.values.sum, lastIndex),
        last: this.valorSerie(serie.values.last, lastIndex),
      };
    };
    const coordinates = central.position?.geo?.coordinates;
    return {
      fuente: 'FieldClimate',
      fecha: dates[lastIndex],
      estacion:
        central.name?.custom || central.name?.original || central.idExterno,
      ubicacion: coordinates?.length
        ? { lng: coordinates[0], lat: coordinates[1] }
        : undefined,
      temperatura: lectura(
        (name) =>
          name.includes('air temperature') ||
          name.includes('i2c temperature') ||
          (name.includes('temperature') && !name.includes('soil')),
        (name) => {
          if (name.includes('air temperature')) return 3;
          if (
            name.includes('temperature') &&
            !name.includes('i2c') &&
            !name.includes('soil')
          )
            return 2;
          if (name.includes('i2c temperature')) return 1;
          return 0;
        },
      ),
      humedad: lectura(
        (name) =>
          name.includes('relative humidity') ||
          name.includes('rel humidity') ||
          name === 'rh',
      ),
      lluvia: lectura(
        (name) => name.includes('precipitation') || name.includes('rain'),
      ),
      velocidadViento: lectura(
        (name) => name.includes('wind speed') && !name.includes('gust'),
      ),
      direccionViento: lectura(
        (name) => name.includes('wind dir') || name.includes('wind direction'),
      ),
      rafagaViento: lectura((name) => name.includes('gust')),
      radiacionSolar: lectura((name) => name.includes('solar radiation')),
      presion: lectura((name) => name.includes('pressure')),
      et0: lectura((name) => name === 'et0' || name.includes('daily et0')),
    };
  }

  private async actualizarCentralFieldClimateDetalle(
    central: IEstacion,
    data: any,
  ): Promise<void> {
    if (!central?._id) {
      return;
    }
    const ultimaLecturaDetalle = this.obtenerUltimaLecturaFieldClimate(data);
    if (!ultimaLecturaDetalle.length) {
      return;
    }
    const ultimaLectura = ultimaLecturaDetalle[0]?.fecha;
    const status = fieldClimateStatus(ultimaLectura);
    const historialLecturas = this.mergeHistorialFieldClimate(
      central.historialLecturas || [],
      this.obtenerHistorialLecturasFieldClimate(data),
    );
    const variables = new Set<string>();
    (central.sensoresDetalle || []).forEach((sensor) => {
      if (sensor.label) variables.add(sensor.label);
    });
    ultimaLecturaDetalle.forEach((lectura) => variables.add(lectura.label));
    try {
      await this.estacionsService.update(central._id, {
        user: protectFieldClimateCredential(central.user),
        pass: protectFieldClimateCredential(central.pass),
        dates: {
          ...central.dates,
          ...(ultimaLectura
            ? {
                max_date: ultimaLectura,
                last_communication: ultimaLectura,
              }
            : {}),
        },
        variablesDisponibles: Array.from(variables).sort(),
        ultimaLecturaDetalle,
        historialLecturas,
        estado: {
          ...central.estado,
          activa: true,
          ultimoSync: new Date().toISOString(),
          ultimoError: null,
          ultimaLectura: status.ultimaLectura,
          reportando: status.reportando,
          conexion: status.conexion,
        },
      });
    } catch {
      Logger.warn(
        `No se pudo actualizar detalle FieldClimate para central ${central._id}`,
      );
    }
  }

  private obtenerUltimaLecturaFieldClimate(
    data: any,
  ): IEstacionLecturaDetalle[] {
    const dates = Array.isArray(data?.dates) ? data.dates : [];
    const lastIndex = this.indiceUltimaFecha(dates);
    if (lastIndex < 0 || !Array.isArray(data?.data)) {
      return [];
    }
    return data.data
      .map((serie) => {
        const label = String(serie?.name || serie?.name_original || '').trim();
        if (!label) {
          return null;
        }
        const values = serie?.values || {};
        const lectura: IEstacionLecturaDetalle = {
          label,
          name: serie?.name,
          nameOriginal: serie?.name_original,
          type: serie?.type,
          unit: serie?.unit,
          decimals: this.toNumber(serie?.decimals),
          code: this.toNumber(serie?.code),
          ch: this.toNumber(serie?.ch),
          group: this.toNumber(serie?.group),
          fecha: dates[lastIndex],
          avg: this.valorSerie(values.avg, lastIndex),
          min: this.valorSerie(values.min, lastIndex),
          max: this.valorSerie(values.max, lastIndex),
          sum: this.valorSerie(values.sum, lastIndex),
          last: this.valorSerie(values.last, lastIndex),
          result: this.valorSerie(values.result, lastIndex),
          count: this.valorSerie(values.count, lastIndex),
        };
        lectura.value =
          lectura.last ??
          lectura.avg ??
          lectura.result ??
          lectura.sum ??
          lectura.max ??
          lectura.min;
        return lectura;
      })
      .filter((lectura): lectura is IEstacionLecturaDetalle => !!lectura);
  }

  private obtenerHistorialLecturasFieldClimate(
    data: any,
  ): IEstacionLecturaHistorica[] {
    const dates = Array.isArray(data?.dates) ? data.dates : [];
    if (!dates.length || !Array.isArray(data?.data)) {
      return [];
    }
    const historial: IEstacionLecturaHistorica[] = [];
    data.data.forEach((serie) => {
      const label = String(serie?.name || serie?.name_original || '').trim();
      if (!label) {
        return;
      }
      const values = serie?.values || {};
      dates.forEach((fecha, index) => {
        const lectura: IEstacionLecturaHistorica = {
          label,
          name: serie?.name,
          nameOriginal: serie?.name_original,
          type: serie?.type,
          unit: serie?.unit,
          color: serie?.color,
          decimals: this.toNumber(serie?.decimals),
          code: this.toNumber(serie?.code),
          ch: this.toNumber(serie?.ch),
          group: this.toNumber(serie?.group),
          fecha: String(fecha),
          avg: this.valorSerie(values.avg, index),
          min: this.valorSerie(values.min, index),
          max: this.valorSerie(values.max, index),
          sum: this.valorSerie(values.sum, index),
          last: this.valorSerie(values.last, index),
          result: this.valorSerie(values.result, index),
          count: this.valorSerie(values.count, index),
        };
        lectura.value =
          lectura.last ??
          lectura.avg ??
          lectura.result ??
          lectura.sum ??
          lectura.max ??
          lectura.min;
        if (typeof lectura.value === 'number') {
          historial.push(lectura);
        }
      });
    });
    return historial;
  }

  private mergeHistorialFieldClimate(
    actual: IEstacionLecturaHistorica[],
    nuevo: IEstacionLecturaHistorica[],
  ): IEstacionLecturaHistorica[] {
    const map = new Map<string, IEstacionLecturaHistorica>();
    [...actual, ...nuevo].forEach((lectura) => {
      if (!lectura?.fecha || !lectura?.label) {
        return;
      }
      const key = [
        lectura.fecha,
        lectura.label,
        lectura.code ?? '',
        lectura.ch ?? '',
        lectura.group ?? '',
      ].join('|');
      map.set(key, lectura);
    });
    return Array.from(map.values())
      .sort((a, b) => this.fechaToTime(a.fecha) - this.fechaToTime(b.fecha))
      .slice(-12000);
  }

  private fechaToTime(fecha: string): number {
    const date = new Date(fecha);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  private indiceUltimaFecha(dates: any[]): number {
    if (!Array.isArray(dates) || !dates.length) {
      return -1;
    }
    return dates.reduce((ultimoIndice, fecha, index) => {
      const actual = this.fechaToTime(String(fecha));
      const ultimo = this.fechaToTime(String(dates[ultimoIndice]));
      return actual >= ultimo ? index : ultimoIndice;
    }, 0);
  }

  private valorSerie(
    values: number[] | undefined,
    index: number,
  ): number | undefined {
    if (!Array.isArray(values)) {
      return undefined;
    }
    const value = values[index];
    return this.toNumber(value);
  }

  private toNumber(value: any): number | undefined {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }

  private vencido(fecha: string, minutos: number): boolean {
    // True si la fecha supera el vencimiento configurado.
    if (!fecha) {
      return true;
    }
    const limite = minutos ? minutos * 60 * 1000 : 15 * 60 * 1000;
    const fechaACheckear = new Date(fecha);
    const fechaActual = new Date();
    const diferencia = fechaActual.getTime() - fechaACheckear.getTime();
    return diferencia > limite;
  }

  // Permisos

  private puedeVer(data: IEstablecimiento, permiso: IPermiso): boolean {
    if (permiso.nivel === 'Admin') {
      return true;
    }
    if (permiso.nivel === 'Tenant') {
      return (
        !!permiso.idTenant &&
        String(data.idTenant || '') === String(permiso.idTenant)
      );
    }
    if (permiso.nivel === 'Quimica') {
      return !data.idQuimica || data.idQuimica === permiso.idQuimica;
    }
    if (permiso.nivel === 'Distribuidor') {
      return (
        !data.idDistribuidor || data.idDistribuidor === permiso.idDistribuidor
      );
    }
    if (permiso.nivel === 'Asesor') {
      return (
        (!data._id && !data.idAsesorPropietario) ||
        String(data.idAsesorPropietario || '') ===
          String(permiso.idAsesor || '') ||
        (!!data._id && permisoPuedeVerEstablecimiento(permiso, data._id))
      );
    }
    if (permiso.nivel === 'Productor') {
      return !data.idProductor || data.idProductor === permiso.idProductor;
    }
    if (permiso.nivel === 'Establecimiento') {
      return !data._id || data._id === permiso.idEstablecimiento;
    }
    return false;
  }

  private agregarFiltroPermiso(query: IQueryParam, permiso: IPermiso) {
    const filtro: IFilter<IEstablecimiento> = HelperService.filtroToObject(
      query.filter,
    );
    const $and = filtro.$and || [];

    if (permiso.nivel === 'Tenant') {
      $and.push({ idTenant: permiso.idTenant });
    }

    if (permiso.nivel === 'Quimica') {
      $and.push({ idQuimica: permiso.idQuimica });
    }
    if (permiso.nivel === 'Distribuidor') {
      $and.push({ idDistribuidor: permiso.idDistribuidor });
    }
    if (permiso.nivel === 'Asesor') {
      $and.push({ _id: { $in: establecimientosDelPermiso(permiso) } });
    }
    if (permiso.nivel === 'Productor') {
      $and.push({ idProductor: permiso.idProductor });
    }
    if (permiso.nivel === 'Establecimiento') {
      $and.push({ _id: permiso.idEstablecimiento });
    }

    if ($and.length > 0) {
      filtro.$and = $and;
      query.filter = JSON.stringify(filtro);
    }
  }

  private withoutAutomaticLocation<T>(input: T): T {
    const data = { ...input } as T & Record<string, unknown>;
    delete data.ubicacionAdministrativa;
    delete data.ubicacionAdministrativaLegada;
    delete data.ubicacionOficial;
    delete data.idAsesorPropietario;
    delete data.idTenant;
    return data;
  }
}
