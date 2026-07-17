import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateNotificacion,
  IQueryParam,
  ICreateNotificacion,
  IFinalizarEntregaPushNotificacion,
  IResultadoClaimNotificacion,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Notificacion, NotificacionDocument } from './modelos/schema';

@Injectable()
export class NotificacionsRepository {
  private indexesReady?: Promise<unknown>;

  constructor(
    @InjectModel(Notificacion.name)
    private readonly model: Model<NotificacionDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Notificacion>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Notificacion> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreateNotificacion): Promise<Notificacion> {
    return await this.model.create(data);
  }

  /**
   * Mantiene idempotencia tambien para consumidores legacy del POST generico.
   * Los documentos historicos solo tienen data.eventKey; los nuevos duplican
   * la clave en eventKey para que MongoDB pueda imponer la unicidad.
   */
  async createIdempotent(
    data: ICreateNotificacion,
  ): Promise<Notificacion> {
    const idUsuario = data.tenant?.idUsuario;
    const eventKey = data.eventKey;
    if (!idUsuario || !eventKey) {
      return await this.create(data);
    }

    await this.ensureIndexes();

    const existente = await this.findByUserEvent(idUsuario, eventKey);
    if (existente) {
      return existente;
    }

    try {
      return await this.create(data);
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) {
        throw error;
      }
      const concurrente = await this.findByUserEvent(idUsuario, eventKey);
      if (concurrente) {
        return concurrente;
      }
      throw error;
    }
  }

  /**
   * Crea el outbox antes de cualquier efecto externo. El indice unico
   * usuario+eventKey decide atomicamente que replica obtiene el claim.
   */
  async claimPush(
    data: ICreateNotificacion,
    claimId: string,
    ahora: Date,
    leaseHasta: Date,
  ): Promise<IResultadoClaimNotificacion> {
    await this.ensureIndexes();
    const idUsuario = data.tenant.idUsuario;
    const eventKey = data.eventKey;

    const canonica = await this.model
      .findOne({ 'tenant.idUsuario': idUsuario, eventKey })
      .lean();
    if (canonica) {
      return await this.reclaimOrDescribe(
        canonica,
        idUsuario,
        eventKey,
        claimId,
        ahora,
        leaseHasta,
      );
    }

    const legacy = await this.model
      .findOne({
        'tenant.idUsuario': idUsuario,
        eventKey: { $exists: false },
        'data.eventKey': eventKey,
      })
      .lean();
    if (legacy) {
      return {
        reclamada: false,
        motivo: 'legacy',
        notificacion: legacy as Notificacion,
      };
    }

    try {
      const creada = await this.model.create({
        ...data,
        eventKey,
        data: { ...(data.data || {}), eventKey },
        entregaPush: {
          estado: 'reclamada',
          claimId,
          reclamadaEn: ahora,
          leaseHasta,
          intentos: 1,
        },
      });
      return {
        reclamada: true,
        motivo: 'creada',
        notificacion: creada,
      };
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) {
        throw error;
      }

      const concurrente = await this.model
        .findOne({ 'tenant.idUsuario': idUsuario, eventKey })
        .lean();
      if (!concurrente) {
        throw error;
      }
      return await this.reclaimOrDescribe(
        concurrente,
        idUsuario,
        eventKey,
        claimId,
        ahora,
        leaseHasta,
      );
    }
  }

  async finalizarEntregaPush(
    id: string,
    data: IFinalizarEntregaPushNotificacion,
    ahora: Date,
    proximoIntentoEn: Date,
  ): Promise<Notificacion | null> {
    const filtro = {
      _id: id,
      'entregaPush.estado': 'reclamada',
      'entregaPush.claimId': data.claimId,
    };
    const $set: Record<string, unknown> = {
      'entregaPush.estado': data.resultado,
    };
    const $unset: Record<string, 1> = {
      'entregaPush.leaseHasta': 1,
    };
    if (data.detalle) {
      $set['entregaPush.detalle'] = data.detalle;
    } else {
      $unset['entregaPush.detalle'] = 1;
    }

    if (data.resultado === 'enviada') {
      $set['entregaPush.enviadaEn'] = ahora;
      $unset['entregaPush.fallidaEn'] = 1;
      $unset['entregaPush.omitidaEn'] = 1;
      $unset['entregaPush.proximoIntentoEn'] = 1;
    } else if (data.resultado === 'omitida') {
      $set['entregaPush.omitidaEn'] = ahora;
      $unset['entregaPush.enviadaEn'] = 1;
      $unset['entregaPush.fallidaEn'] = 1;
      $unset['entregaPush.proximoIntentoEn'] = 1;
    } else {
      $set['entregaPush.fallidaEn'] = ahora;
      $set['entregaPush.proximoIntentoEn'] = proximoIntentoEn;
      $unset['entregaPush.enviadaEn'] = 1;
      $unset['entregaPush.omitidaEn'] = 1;
    }

    return await this.model
      .findOneAndUpdate(filtro, { $set, $unset }, { new: true })
      .lean();
  }

  async bulk(data: ICreateNotificacion[]): Promise<Notificacion[]> {
    return await this.model.insertMany(data, { ordered: false });
  }

  async update(id: string, data: IUpdateNotificacion): Promise<Notificacion> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async updateMany(query: IQueryParam, dato: IUpdateNotificacion) {
    const filter = JSON.parse(query.filter);
    const update = { $set: dato };
    const doc = await this.model.updateMany(filter, update);
    return doc;
  }

  async delete(id: string): Promise<Notificacion> {
    const existente = await this.model.findById(id).lean();
    if (
      existente?.tenant?.idUsuario &&
      (existente.eventKey || existente.data?.eventKey)
    ) {
      // La fila funciona como tombstone de idempotencia: se oculta para la
      // interfaz, pero no se elimina la barrera usuario+evento.
      return await this.model.findByIdAndUpdate(
        id,
        {
          $set: {
            oculta: true,
            leido: true,
            fechaEliminacion: new Date(),
          },
        },
        { new: true },
      );
    }
    return await this.model.findByIdAndDelete(id);
  }

  private async reclaimOrDescribe(
    existente: any,
    idUsuario: string,
    eventKey: string,
    claimId: string,
    ahora: Date,
    leaseHasta: Date,
  ): Promise<IResultadoClaimNotificacion> {
    const reclamada = await this.model
      .findOneAndUpdate(
        {
          'tenant.idUsuario': idUsuario,
          eventKey,
          $or: [
            {
              'entregaPush.estado': 'fallida',
              'entregaPush.proximoIntentoEn': { $lte: ahora },
            },
            {
              'entregaPush.estado': 'fallida',
              'entregaPush.proximoIntentoEn': { $exists: false },
            },
            {
              'entregaPush.estado': 'reclamada',
              'entregaPush.leaseHasta': { $lte: ahora },
            },
          ],
        },
        {
          $set: {
            'entregaPush.estado': 'reclamada',
            'entregaPush.claimId': claimId,
            'entregaPush.reclamadaEn': ahora,
            'entregaPush.leaseHasta': leaseHasta,
          },
          $unset: {
            'entregaPush.enviadaEn': 1,
            'entregaPush.fallidaEn': 1,
            'entregaPush.omitidaEn': 1,
            'entregaPush.proximoIntentoEn': 1,
            'entregaPush.detalle': 1,
          },
          $inc: { 'entregaPush.intentos': 1 },
        },
        { new: true },
      )
      .lean();

    if (reclamada) {
      return {
        reclamada: true,
        motivo: 'reintento',
        notificacion: reclamada as Notificacion,
      };
    }

    const vigente = await this.model
      .findOne({ 'tenant.idUsuario': idUsuario, eventKey })
      .lean();
    const actual = vigente || existente;
    const estado = actual?.entregaPush?.estado;
    return {
      reclamada: false,
      motivo:
        estado === 'reclamada'
          ? 'en-curso'
          : estado === 'fallida'
            ? 'espera-reintento'
            : 'duplicada',
      notificacion: actual as Notificacion,
    };
  }

  private async findByUserEvent(
    idUsuario: string,
    eventKey: string,
  ): Promise<Notificacion | null> {
    return (await this.model
      .findOne({
        'tenant.idUsuario': idUsuario,
        $or: [{ eventKey }, { 'data.eventKey': eventKey }],
      })
      .lean()) as Notificacion | null;
  }

  private isDuplicateKeyError(error: any): boolean {
    return Number(error?.code) === 11000;
  }

  private async ensureIndexes(): Promise<void> {
    if (!this.indexesReady) {
      this.indexesReady = this.model.init();
    }
    await this.indexesReady;
  }
}
