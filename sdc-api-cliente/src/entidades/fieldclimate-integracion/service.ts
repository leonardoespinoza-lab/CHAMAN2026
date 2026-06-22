import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ICreateEstacion,
  IEstablecimiento,
  IEstacion,
  IListado,
  IQueryParam,
  Sensores,
} from 'modelos/src';
import {
  FieldClimateCredentials,
  FieldClimateIntegracionRepository,
} from './repository';

interface DescubrirCentralesBody extends FieldClimateCredentials {}

interface ImportarCentralBody extends FieldClimateCredentials {
  stationId: string;
  idEstablecimiento?: string;
}

interface AsignarCentralBody {
  idEstablecimiento: string;
}

@Injectable()
export class FieldClimateIntegracionService {
  constructor(private repository: FieldClimateIntegracionRepository) {}

  async descubrir(body: DescubrirCentralesBody): Promise<any[]> {
    this.validarCredenciales(body);
    const centrales = await this.repository.descubrirCentrales(body);
    return centrales.map((central) => this.sanitizeFieldClimateStation(central));
  }

  async importar(body: ImportarCentralBody): Promise<IEstacion> {
    this.validarCredenciales(body);
    if (!body.stationId) {
      throw new BadRequestException('Debe indicar la central a importar');
    }

    let central = await this.repository.obtenerCentral(body.stationId, body);
    if (!central?.name && !central?.info) {
      const centrales = await this.repository.descubrirCentrales(body);
      central = centrales.find(
        (item) => this.getStationExternalId(item) === body.stationId,
      );
    }
    if (!central) {
      throw new BadRequestException('No se encontro la central FieldClimate');
    }

    let sensoresRaw: any = [];
    try {
      sensoresRaw = await this.repository.obtenerSensores(body.stationId, body);
    } catch {
      sensoresRaw = [];
    }

    const data = this.mapCentralChaman(
      central,
      sensoresRaw,
      body,
      body.idEstablecimiento,
    );
    const estacion = await this.repository.upsertCentral(data);

    if (body.idEstablecimiento) {
      await this.asignar(estacion._id, {
        idEstablecimiento: body.idEstablecimiento,
      });
    }

    return this.sanitizeEstacion(estacion);
  }

  async listar(params: IQueryParam = {}): Promise<IListado<IEstacion>> {
    const query = this.agregarFiltroFieldClimate(params);
    const res = await this.repository.listarCentrales(query);
    return {
      ...res,
      datos: (res.datos || []).map((item) => this.sanitizeEstacion(item)),
    };
  }

  async listarEstablecimientos(
    params: IQueryParam = {},
  ): Promise<IListado<IEstablecimiento>> {
    const query = {
      ...params,
      limit: params.limit || 200,
      select: params.select || 'nombre idProductor ubicacionAdministrativa',
    };
    return await this.repository.listarEstablecimientos(query);
  }

  async asignar(
    idCentral: string,
    body: AsignarCentralBody,
  ): Promise<IEstacion> {
    if (!idCentral || !body.idEstablecimiento) {
      throw new BadRequestException('Debe indicar central y establecimiento');
    }
    const fecha = new Date().toISOString();
    const central = await this.repository.actualizarCentral(idCentral, {
      idEstablecimiento: body.idEstablecimiento,
      estado: {
        activa: true,
        ultimoSync: fecha,
      },
    });
    await this.repository.actualizarEstablecimiento(body.idEstablecimiento, {
      idEstacionMeteorologica: idCentral,
      fuenteClimaPreferida: 'FieldClimate',
    });
    return this.sanitizeEstacion(central);
  }

  private validarCredenciales(credentials: FieldClimateCredentials) {
    if (!credentials?.username || !credentials?.password) {
      throw new BadRequestException('Usuario y password FieldClimate requeridos');
    }
  }

  private agregarFiltroFieldClimate(params: IQueryParam): IQueryParam {
    const filterRaw = params.filter || params.filtro;
    let filter: Record<string, any> = {};
    if (filterRaw) {
      try {
        filter = JSON.parse(filterRaw);
      } catch {
        filter = {};
      }
    }
    const $and = Array.isArray(filter.$and) ? filter.$and : [];
    $and.push({ origen: 'FieldClimate' });
    filter.$and = $and;
    return {
      ...params,
      filter: JSON.stringify(filter),
      limit: params.limit || 100,
    };
  }

  private mapCentralChaman(
    station: any,
    sensoresRaw: any,
    credentials: FieldClimateCredentials,
    idEstablecimiento?: string,
  ): ICreateEstacion {
    const idExterno = this.getStationExternalId(station);
    const sensores = this.inferirSensores(station, sensoresRaw);
    const variablesDisponibles = this.obtenerVariables(station, sensoresRaw);
    return {
      origen: 'FieldClimate',
      idExterno,
      user: credentials.username,
      pass: credentials.password,
      name: station.name,
      info: station.info,
      dates: station.dates,
      position: station.position,
      sensores,
      variablesDisponibles,
      idEstablecimiento,
      estado: {
        activa: true,
        ultimoSync: new Date().toISOString(),
      },
    };
  }

  private getStationExternalId(station: any): string {
    return String(
      station?.name?.original ||
        station?.info?.uid ||
        station?.info?.device_id ||
        '',
    );
  }

  private inferirSensores(station: any, sensoresRaw: any): Sensores[] {
    const sensores = new Set<Sensores>();
    const meta = station?.meta || {};
    if ('airTemp' in meta) sensores.add('temperatura');
    if ('rh' in meta) sensores.add('humedad');
    if ('solarRadiation' in meta) sensores.add('radiacion_solar');
    if ('soilTemp' in meta) sensores.add('temperatura_suelo');
    if ('volumetricAverage' in meta) sensores.add('humedad_suelo_profundidad');
    if ('rain24h' in meta || 'rain48h' in meta || 'rain7d' in meta) {
      sensores.add('pluviometro');
    }

    for (const sensor of this.flattenSensores(sensoresRaw)) {
      const name = String(sensor?.name || sensor?.name_custom || '').toLowerCase();
      if (name.includes('air temperature') || name.includes('temperature')) {
        sensores.add(name.includes('soil') ? 'temperatura_suelo' : 'temperatura');
      }
      if (name.includes('relative humidity') || name.includes('humidity')) {
        sensores.add('humedad');
      }
      if (name.includes('precipitation') || name.includes('rain')) {
        sensores.add('pluviometro');
      }
      if (name.includes('wind speed') || name.includes('gust')) {
        sensores.add('viento_velocidad');
      }
      if (name.includes('wind dir') || name.includes('wind direction')) {
        sensores.add('viento_direccion');
      }
      if (name.includes('solar')) {
        sensores.add('radiacion_solar');
      }
      if (name.includes('soil moisture') || name.includes('vwc')) {
        sensores.add('humedad_suelo_profundidad');
      }
    }

    if (!sensores.size) {
      sensores.add('otro');
    }
    return Array.from(sensores);
  }

  private obtenerVariables(station: any, sensoresRaw: any): string[] {
    const variables = new Set<string>();
    Object.keys(station?.meta || {}).forEach((key) => variables.add(key));
    this.flattenSensores(sensoresRaw).forEach((sensor) => {
      const name = sensor?.name_custom || sensor?.name;
      if (name) variables.add(String(name));
    });
    return Array.from(variables).sort();
  }

  private flattenSensores(sensoresRaw: any): any[] {
    if (Array.isArray(sensoresRaw)) {
      return sensoresRaw;
    }
    if (sensoresRaw && typeof sensoresRaw === 'object') {
      return Object.values(sensoresRaw).flatMap((item: any) =>
        Array.isArray(item) ? item : [item],
      );
    }
    return [];
  }

  private sanitizeFieldClimateStation(station: any) {
    return {
      name: station?.name,
      info: station?.info,
      dates: station?.dates,
      position: station?.position,
      meta: station?.meta,
      rights: station?.rights,
      idExterno: this.getStationExternalId(station),
    };
  }

  private sanitizeEstacion(estacion: IEstacion): IEstacion {
    if (!estacion) {
      return estacion;
    }
    return {
      ...estacion,
      user: undefined,
      pass: undefined,
      apikey: undefined,
    };
  }
}
