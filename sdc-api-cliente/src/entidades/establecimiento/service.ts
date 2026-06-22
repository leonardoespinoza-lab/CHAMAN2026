import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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
  IValores,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { EstablecimientosRepository } from './repository';
import { ClimaRepository } from '../clima/repository';
import { ProductorsService } from '../productor/service';
import { CLIMA_CACHE_TTL_MINUTES } from '../../env';
import { EstacionsService } from '../estacion/service';

@Injectable()
export class EstablecimientosService {
  constructor(
    private repository: EstablecimientosRepository,
    private climaRepository: ClimaRepository,
    private productorsService: ProductorsService,
    private estacionsService: EstacionsService,
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
    return await this.repository.update(id, data);
  }

  async delete(id: string, permiso: IPermiso): Promise<IEstablecimiento> {
    await this.getById(id, permiso);
    return await this.repository.delete(id);
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

      const resultados = await Promise.allSettled(
        establecimientos.map(async (est) => {
          await Promise.all([this.checkPronostico(est), this.checkClima(est)]);
          return est._id;
        }),
      );
      actualizados += resultados.filter((item) => item.status === 'fulfilled')
        .length;
      errores += resultados.filter((item) => item.status === 'rejected').length;

      if (establecimientos.length < limit || (page + 1) * limit >= total) {
        break;
      }
      page += 1;
    }

    return { total, actualizados, errores };
  }

  // Private

  private async checkPronostico(est: IEstablecimiento) {
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

  private async getClimaActualFieldClimate(
    est: IEstablecimiento,
  ): Promise<IClimaEstacionMeteorologica | null> {
    if (
      est.fuenteClimaPreferida !== 'FieldClimate' ||
      !est.idEstacionMeteorologica
    ) {
      return null;
    }
    try {
      const central = await this.estacionsService.getById(
        est.idEstacionMeteorologica,
      );
      if (!central?.idExterno || !central.user || !central.pass) {
        return null;
      }
      const data = await this.climaRepository.getFieldClimateLastData(
        central.idExterno,
        central.user,
        central.pass,
      );
      return this.normalizarFieldClimateActual(central, data);
    } catch (error) {
      Logger.warn(
        `No se pudo usar FieldClimate para establecimiento ${est._id}; se usa respaldo Open-Meteo`,
      );
      return null;
    }
  }

  private normalizarFieldClimateActual(
    central: IEstacion,
    data: any,
  ): IClimaEstacionMeteorologica | null {
    const dates = data?.dates || [];
    const lastIndex = dates.length ? dates.length - 1 : -1;
    if (lastIndex < 0 || !Array.isArray(data?.data)) {
      return null;
    }
    const lectura = (matcher: (name: string) => boolean): IValores | undefined => {
      const serie = data.data.find((item) => {
        const name = String(item?.name || item?.name_original || '').toLowerCase();
        return matcher(name);
      });
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
      estacion: central.name?.custom || central.name?.original || central.idExterno,
      ubicacion: coordinates?.length
        ? { lng: coordinates[0], lat: coordinates[1] }
        : undefined,
      temperatura: lectura((name) =>
        name.includes('air temperature') || name === 'temperature',
      ),
      humedad: lectura((name) => name.includes('relative humidity')),
      lluvia: lectura((name) =>
        name.includes('precipitation') || name.includes('rain'),
      ),
      velocidadViento: lectura((name) =>
        name.includes('wind speed') && !name.includes('gust'),
      ),
      direccionViento: lectura((name) =>
        name.includes('wind dir') || name.includes('wind direction'),
      ),
      rafagaViento: lectura((name) => name.includes('gust')),
      radiacionSolar: lectura((name) => name.includes('solar radiation')),
      presion: lectura((name) => name.includes('pressure')),
      et0: lectura((name) => name === 'et0' || name.includes('daily et0')),
    };
  }

  private valorSerie(values: number[] | undefined, index: number): number | undefined {
    if (!Array.isArray(values)) {
      return undefined;
    }
    const value = values[index];
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
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
    if (permiso.nivel === 'Quimica') {
      return !data.idQuimica || data.idQuimica === permiso.idQuimica;
    }
    if (permiso.nivel === 'Distribuidor') {
      return (
        !data.idDistribuidor || data.idDistribuidor === permiso.idDistribuidor
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

    if (permiso.nivel === 'Quimica') {
      $and.push({ idQuimica: permiso.idQuimica });
    }
    if (permiso.nivel === 'Distribuidor') {
      $and.push({ idDistribuidor: permiso.idDistribuidor });
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
}
