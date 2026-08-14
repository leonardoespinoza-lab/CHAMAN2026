import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateDispositivo,
  IQueryParam,
  ICreateDispositivo,
  IAsignacionDispositivoLote,
  ILorawanDeviceCatalogItem,
  ILorawanDeviceCatalogSyncResult,
  ILorawanUplink,
  SensoresV2,
  TipoDispositivo,
  serviciosDispositivoNormalizados,
  IServicioDispositivo,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Dispositivo, DispositivoDocument } from './modelos/schema';
import { decodeControllerUplink } from '../lorawan-uplinks/controller-decoder.registry';

@Injectable()
export class DispositivosRepository {
  constructor(
    @InjectModel(Dispositivo.name)
    private readonly model: Model<DispositivoDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Dispositivo>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Dispositivo> {
    return await this.model
      .findById(id)
      .populate('quimica distribuidor productor')
      .lean();
  }

  async create(data: ICreateDispositivo): Promise<Dispositivo> {
    const fechaAsignacionLote =
      data.fechaAsignacionLote ||
      (data.idLote ? new Date().toISOString() : undefined);
    const historialAsignacionesLote =
      data.historialAsignacionesLote ||
      (data.idLote && fechaAsignacionLote
        ? [this.crearSegmentoAsignacion(data, fechaAsignacionLote)]
        : []);

    const servicios = serviciosDispositivoNormalizados(data).map((servicio) =>
      this.normalizarServicio(servicio),
    );
    return await this.model.create({
      ...data,
      fechaAsignacionLote,
      historialAsignacionesLote,
      ...(servicios.length ? { servicios } : {}),
    });
  }

  private inferDeviceFromLorawanUplink(uplink: ILorawanUplink): {
    tipo: TipoDispositivo;
    sensores: SensoresV2[];
    configuracionLecturas?: IUpdateDispositivo['configuracionLecturas'];
    decoder?: {
      id: string;
      version: string;
      manufacturer: string;
      model: string;
    };
  } {
    const text =
      `${uplink.deviceName || ''} ${uplink.applicationName || ''}`.toLowerCase();
    const decoded = decodeControllerUplink(uplink);
    const hasDecodedSoil = decoded?.capabilities.soilProfile === true;
    const hasDecodedAnalog = decoded?.capabilities.analogInput === true;
    const hasExplicitSoilIdentity =
      text.includes('sentek') ||
      text.includes('lanza') ||
      text.includes('humedad de suelo') ||
      text.includes('soil moisture');
    const hasExplicitAnalogIdentity =
      text.includes('napa') ||
      text.includes('freat') ||
      text.includes('4-20') ||
      text.includes('analog');

    if (
      hasDecodedSoil ||
      hasDecodedAnalog ||
      hasExplicitSoilIdentity ||
      hasExplicitAnalogIdentity
    ) {
      const hasSoil = hasDecodedSoil || hasExplicitSoilIdentity;
      const hasAnalog = hasDecodedAnalog || hasExplicitAnalogIdentity;
      const sensores: SensoresV2[] = [];
      if (hasSoil) {
        sensores.push(
          'Humedad Suelo Profundidad',
          'Temperatura Suelo',
          'Salinidad Suelo',
        );
      }
      if (hasAnalog) sensores.push('Entrada Analógica');
      return {
        tipo: hasSoil ? 'Sensor de Humedad de Suelo' : 'Otro',
        sensores,
        configuracionLecturas: {
          ...(hasSoil
            ? {
                perfilSuelo: {
                  tipo: 'sonda_sentek_120cm' as const,
                  protocolo: 'SDI-12' as const,
                  niveles: 12 as const,
                  profundidadesCm: [
                    10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120,
                  ],
                  variables: [
                    'humedad_vwc' as const,
                    'salinidad_vic' as const,
                    'temperatura' as const,
                  ],
                },
              }
            : {}),
          ...(hasAnalog
            ? {
                entradaAnalogica: {
                  canal: 1 as const,
                  tipoSenal: '4-20mA' as const,
                  variable: 'sin_definir' as const,
                  entradaMinMa: 4,
                  entradaMaxMa: 20,
                },
              }
            : {}),
        },
        decoder: decoded
          ? {
              id: decoded.decoderId,
              version: decoded.decoderVersion,
              manufacturer: decoded.manufacturer,
              model: decoded.model,
            }
          : undefined,
      };
    }

    if (
      text.includes('pluvio') ||
      text.includes('lluvia') ||
      text.includes('rain')
    ) {
      return {
        tipo: 'Pluviometro',
        sensores: ['Pluviometro'],
      };
    }

    if (
      text.includes('meteo') ||
      text.includes('weather') ||
      text.includes('estacion') ||
      text.includes('abrigo') ||
      text.includes('temp y hum') ||
      text.includes('temperatura') ||
      text.includes('humidity') ||
      text.includes('humedad ambiente')
    ) {
      return {
        tipo: 'Estacion Meteorologica',
        sensores: ['Temperatura', 'Humedad', 'Batería'],
      };
    }

    return {
      tipo: 'Otro',
      sensores: ['Otro'],
    };
  }

  async upsertFromLorawanUplink(
    uplink: ILorawanUplink,
  ): Promise<Dispositivo | null> {
    if (!uplink.devEUI) {
      return null;
    }

    const devEUI = uplink.devEUI.toUpperCase();
    const timestamp = uplink.timestamp || new Date().toISOString();
    const inferred = this.inferDeviceFromLorawanUplink(uplink);
    const hasSoilProfile = !!inferred.configuracionLecturas?.perfilSuelo;
    const hasAnalogInput = !!inferred.configuracionLecturas?.entradaAnalogica;
    const inferredName =
      hasSoilProfile && hasAnalogInput
        ? `Controlador Milesight con Sentek y entrada analógica ${devEUI}`
        : hasSoilProfile
          ? `Controlador Milesight con Sentek ${devEUI}`
          : hasAnalogInput
            ? `Controlador Milesight con entrada analógica ${devEUI}`
            : devEUI;
    const existing = await this.model.findOne({ deveui: devEUI }).lean();
    const update: IUpdateDispositivo = {
      deveui: devEUI,
      nombre: uplink.deviceName || inferredName,
      tipo: inferred.tipo,
      sensores: inferred.sensores,
      configuracionLecturas: inferred.configuracionLecturas,
      fechaUltimaComunicacion: timestamp,
      metadata: {
        ...(existing?.metadata || {}),
        applicationID: uplink.applicationID,
        applicationName: uplink.applicationName,
        gatewayID: uplink.gatewayID,
        frequency: uplink.frequency,
        fCnt: uplink.fCnt,
        fPort: uplink.fPort,
        rssi: uplink.rssi,
        snr: uplink.snr,
        dr: uplink.dr,
        ...(inferred.decoder
          ? {
              payloadDecoderId: inferred.decoder.id,
              payloadDecoderVersion: inferred.decoder.version,
              controllerManufacturer: inferred.decoder.manufacturer,
              controllerModel: inferred.decoder.model,
            }
          : {}),
      },
    };
    const inferredServices = serviciosDispositivoNormalizados(update).map(
      (servicio) => this.normalizarServicio(servicio),
    );

    const $set: IUpdateDispositivo = {
      fechaUltimaComunicacion: update.fechaUltimaComunicacion,
      metadata: update.metadata,
    };

    if (existing && !existing.nombre && update.nombre) {
      $set.nombre = update.nombre;
    }

    if (
      existing &&
      (!existing.tipo || existing.tipo === 'Otro') &&
      update.tipo !== 'Otro'
    ) {
      $set.tipo = update.tipo;
    }

    if (existing) {
      // Nunca se eliminan etiquetas o configuraciones históricas en una ingesta.
      // La inferencia nueva deja de crear Napa/Presión, pero una depuración legacy
      // requiere una acción administrativa explícita y auditable.
      const existingSensors = existing.sensores || [];
      const mergedSensors = [
        ...new Set([...existingSensors, ...(update.sensores || [])]),
      ];
      if (
        JSON.stringify(mergedSensors) !==
        JSON.stringify(existing.sensores || [])
      ) {
        $set.sensores = mergedSensors;
      }
      if (update.configuracionLecturas) {
        const mergedConfiguration = {
          ...(existing.configuracionLecturas || {}),
          ...(!existing.configuracionLecturas?.perfilSuelo &&
          update.configuracionLecturas.perfilSuelo
            ? { perfilSuelo: update.configuracionLecturas.perfilSuelo }
            : {}),
          ...(!existing.configuracionLecturas?.entradaAnalogica &&
          update.configuracionLecturas.entradaAnalogica
            ? {
                entradaAnalogica: update.configuracionLecturas.entradaAnalogica,
              }
            : {}),
        };
        if (
          JSON.stringify(mergedConfiguration) !==
          JSON.stringify(existing.configuracionLecturas || {})
        ) {
          $set.configuracionLecturas = mergedConfiguration as any;
        }
      }
      if (inferredServices.length) {
        const existingServices = existing.servicios || [];
        const missingServices = inferredServices.filter(
          (inferredService) =>
            !existingServices.some(
              (existingService) => existingService.id === inferredService.id,
            ),
        );
        if (missingServices.length) {
          $set.servicios = [...existingServices, ...missingServices];
        }
      }
    }

    if (existing) {
      return await this.model
        .findOneAndUpdate({ deveui: devEUI }, { $set }, { new: true })
        .lean();
    }

    return await this.model.create({
      ...update,
      ...(inferredServices.length ? { servicios: inferredServices } : {}),
    });
  }

  async syncFromLorawanCatalog(
    items: ILorawanDeviceCatalogItem[],
  ): Promise<ILorawanDeviceCatalogSyncResult> {
    const result: ILorawanDeviceCatalogSyncResult = {
      total: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
    };
    const syncedAt = new Date().toISOString();

    for (const item of items) {
      const devEUI = String(item.devEUI || '')
        .trim()
        .toUpperCase();
      if (!/^[0-9A-F]{16}$/.test(devEUI)) continue;
      result.total += 1;
      const existing = await this.model.findOne({ deveui: devEUI }).lean();
      const catalogIdentity = [
        item.name,
        item.description,
        item.deviceProfileName,
        item.applicationName,
      ]
        .filter(Boolean)
        .join(' ');
      const inferred = this.inferDeviceFromLorawanUplink({
        devEUI,
        deviceName: catalogIdentity,
        applicationName: item.applicationName,
      } as ILorawanUplink);
      const inferredServices = serviciosDispositivoNormalizados(inferred).map(
        (servicio) => this.normalizarServicio(servicio),
      );
      const metadata = {
        ...(existing?.metadata || {}),
        origenInventario: 'ChirpStack' as const,
        chirpstackSincronizadoEn: syncedAt,
        chirpstackTenantID: item.tenantID,
        chirpstackApplicationID: item.applicationID,
        chirpstackApplicationName: item.applicationName,
        chirpstackDeviceProfileID: item.deviceProfileID,
        chirpstackDeviceProfileName: item.deviceProfileName,
        chirpstackDescription: item.description,
        chirpstackLastSeenAt: item.lastSeenAt,
      };

      if (!existing) {
        await this.model.create({
          deveui: devEUI,
          nombre: item.name?.trim() || devEUI,
          tipo: inferred.tipo,
          sensores: inferred.sensores,
          configuracionLecturas: inferred.configuracionLecturas,
          ...(inferredServices.length ? { servicios: inferredServices } : {}),
          metadata,
        });
        result.created += 1;
        continue;
      }

      const $set: IUpdateDispositivo = { metadata };
      const currentName = String(existing.nombre || '').trim();
      if (
        (!currentName || currentName.toUpperCase() === devEUI) &&
        item.name?.trim()
      ) {
        $set.nombre = item.name.trim();
      }
      if (
        (!existing.tipo || existing.tipo === 'Otro') &&
        inferred.tipo !== 'Otro'
      ) {
        $set.tipo = inferred.tipo;
        $set.sensores = [
          ...new Set([...(existing.sensores || []), ...inferred.sensores]),
        ];
      }
      if (!existing.configuracionLecturas && inferred.configuracionLecturas) {
        $set.configuracionLecturas = inferred.configuracionLecturas;
      }
      if (!existing.servicios?.length && inferredServices.length) {
        $set.servicios = inferredServices;
      }
      const metadataComparable = {
        ...(existing.metadata || {}),
        ...metadata,
      };
      delete metadataComparable.chirpstackSincronizadoEn;
      const existingMetadataComparable = { ...(existing.metadata || {}) };
      delete existingMetadataComparable.chirpstackSincronizadoEn;
      const nameChanged = !!$set.nombre && $set.nombre !== existing.nombre;
      const classificationChanged = Boolean(
        $set.tipo ||
        $set.sensores ||
        $set.configuracionLecturas ||
        $set.servicios,
      );
      const metadataChanged =
        JSON.stringify(metadataComparable) !==
        JSON.stringify(existingMetadataComparable);

      if (nameChanged || metadataChanged || classificationChanged) {
        await this.model.updateOne({ _id: existing._id }, { $set });
        result.updated += 1;
      } else {
        result.unchanged += 1;
      }
    }
    return result;
  }

  async update(id: string, data: IUpdateDispositivo): Promise<Dispositivo> {
    const updateData: IUpdateDispositivo = { ...data };
    const unsetData: Record<string, 1> = {};
    const cambiaLote = Object.prototype.hasOwnProperty.call(data, 'idLote');
    const cambiaFechaAsignacion = Object.prototype.hasOwnProperty.call(
      data,
      'fechaAsignacionLote',
    );

    if (Object.prototype.hasOwnProperty.call(data, 'servicios')) {
      const actual = await this.model.findById(id).select('servicios').lean();
      updateData.servicios = this.reconciliarServicios(
        actual?.servicios || [],
        data.servicios || [],
      );
    }

    if (cambiaLote || cambiaFechaAsignacion) {
      const actual = await this.model
        .findById(id)
        .select(
          'idLote idProductor idEstablecimiento fechaAsignacionLote historialAsignacionesLote',
        )
        .lean();
      const loteAnterior = actual?.idLote ? String(actual.idLote) : '';
      const loteNuevo = cambiaLote
        ? data.idLote
          ? String(data.idLote)
          : ''
        : loteAnterior;
      const fechaAsignacion =
        data.fechaAsignacionLote ||
        actual?.fechaAsignacionLote ||
        new Date().toISOString();

      if (loteAnterior !== loteNuevo) {
        if (loteNuevo) {
          updateData.fechaAsignacionLote = fechaAsignacion;
          updateData.historialAsignacionesLote =
            this.actualizarHistorialPorCambioDeLote(
              actual,
              data,
              fechaAsignacion,
              loteAnterior,
              loteNuevo,
            );
        } else {
          delete updateData.fechaAsignacionLote;
          unsetData.fechaAsignacionLote = 1;
          updateData.historialAsignacionesLote =
            this.actualizarHistorialPorCambioDeLote(
              actual,
              data,
              fechaAsignacion,
              loteAnterior,
              loteNuevo,
            );
        }
      } else if (
        cambiaFechaAsignacion &&
        loteNuevo &&
        data.fechaAsignacionLote
      ) {
        updateData.historialAsignacionesLote =
          this.actualizarFechaSegmentoActivo(
            actual,
            data,
            data.fechaAsignacionLote,
            loteNuevo,
          );
      }
    }

    const update = Object.keys(unsetData).length
      ? { $set: updateData, $unset: unsetData }
      : updateData;

    return await this.model.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });
  }

  async delete(id: string): Promise<Dispositivo> {
    return await this.model.findByIdAndDelete(id);
  }

  private reconciliarServicios(
    anteriores: IServicioDispositivo[],
    siguientes: IServicioDispositivo[],
  ): IServicioDispositivo[] {
    const ids = new Set<string>();
    return siguientes.map((servicio) => {
      const normalizado = this.normalizarServicio(servicio);
      if (ids.has(normalizado.id)) {
        throw new Error(
          `Servicio duplicado en el controlador: ${normalizado.id}`,
        );
      }
      ids.add(normalizado.id);
      const anterior = anteriores.find((item) => item.id === normalizado.id);
      const loteAnterior = String(anterior?.idLote || '');
      const loteNuevo = String(normalizado.idLote || '');
      const fecha = this.normalizarFecha(
        normalizado.fechaAsignacionLote ||
          anterior?.fechaAsignacionLote ||
          new Date().toISOString(),
      );
      const historial = this.clonarHistorial(
        anterior?.historialAsignacionesLote,
      );

      if (loteAnterior !== loteNuevo) {
        historial.forEach((segmento) => {
          if (segmento.activa || !segmento.fechaHasta) {
            segmento.activa = false;
            segmento.fechaHasta ||= fecha;
          }
        });
        if (loteNuevo) {
          historial.push(this.crearSegmentoAsignacion(normalizado, fecha));
        }
      }

      return {
        ...normalizado,
        fechaAsignacionLote: loteNuevo ? fecha : undefined,
        historialAsignacionesLote: historial,
        fuente: 'administrador',
      };
    });
  }

  private normalizarServicio(
    servicio: IServicioDispositivo,
  ): IServicioDispositivo {
    return {
      ...servicio,
      id: String(servicio.id || '')
        .trim()
        .toLowerCase(),
      nombre: String(servicio.nombre || '').trim(),
      sensores: [...new Set(servicio.sensores || [])],
      habilitado: servicio.habilitado !== false,
      idProductor: servicio.idProductor || undefined,
      idEstablecimiento: servicio.idEstablecimiento || undefined,
      idLote: servicio.idLote || undefined,
    };
  }

  private actualizarHistorialPorCambioDeLote(
    actual: Partial<Dispositivo> | null,
    data: IUpdateDispositivo,
    fechaAsignacion: string,
    loteAnterior: string,
    loteNuevo: string,
  ): IAsignacionDispositivoLote[] {
    const fecha = this.normalizarFecha(fechaAsignacion);
    const historial = this.clonarHistorial(actual?.historialAsignacionesLote);

    for (const segmento of historial) {
      const idLoteSegmento = segmento.idLote ? String(segmento.idLote) : '';
      const esSegmentoActual =
        segmento.activa ||
        (!!loteAnterior &&
          idLoteSegmento === loteAnterior &&
          !segmento.fechaHasta);

      if (esSegmentoActual) {
        segmento.activa = false;
        segmento.fechaHasta = segmento.fechaHasta || fecha;
      }
    }

    if (loteNuevo) {
      historial.push(
        this.crearSegmentoAsignacion(
          {
            ...actual,
            ...data,
            idLote: loteNuevo,
          },
          fecha,
        ),
      );
    }

    return historial;
  }

  private actualizarFechaSegmentoActivo(
    actual: Partial<Dispositivo> | null,
    data: IUpdateDispositivo,
    fechaAsignacion: string,
    loteActual: string,
  ): IAsignacionDispositivoLote[] {
    const fecha = this.normalizarFecha(fechaAsignacion);
    const historial = this.clonarHistorial(actual?.historialAsignacionesLote);
    let index = -1;

    for (let i = historial.length - 1; i >= 0; i--) {
      const segmento = historial[i];
      const idLoteSegmento = segmento.idLote ? String(segmento.idLote) : '';
      if (
        idLoteSegmento === loteActual &&
        (segmento.activa || !segmento.fechaHasta)
      ) {
        index = i;
        break;
      }
    }

    if (index >= 0) {
      historial[index] = {
        ...historial[index],
        activa: true,
        fechaDesde: fecha,
      };
      return historial;
    }

    historial.push(
      this.crearSegmentoAsignacion(
        {
          ...actual,
          ...data,
          idLote: loteActual,
        },
        fecha,
      ),
    );
    return historial;
  }

  private crearSegmentoAsignacion(
    data: Pick<
      Partial<IUpdateDispositivo>,
      'idLote' | 'idProductor' | 'idEstablecimiento'
    >,
    fechaDesde: string,
  ): IAsignacionDispositivoLote {
    return {
      idLote: data.idLote ? String(data.idLote) : undefined,
      idProductor: data.idProductor ? String(data.idProductor) : undefined,
      idEstablecimiento: data.idEstablecimiento
        ? String(data.idEstablecimiento)
        : undefined,
      fechaDesde: this.normalizarFecha(fechaDesde),
      activa: true,
    };
  }

  private clonarHistorial(
    historial?: IAsignacionDispositivoLote[],
  ): IAsignacionDispositivoLote[] {
    return Array.isArray(historial)
      ? historial.map((segmento) => ({ ...segmento }))
      : [];
  }

  private normalizarFecha(fecha?: string): string {
    const parsed = fecha ? new Date(fecha) : new Date();
    return Number.isNaN(parsed.getTime())
      ? new Date().toISOString()
      : parsed.toISOString();
  }
}
