import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IFinalizarEventoAlerta,
  IListado,
  IRegistrarEventoAlerta,
  IResultadoRegistroEventoAlerta,
  IUpdateAlerta,
  IQueryParam,
  ICreateAlerta,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Alerta, AlertaDocument } from './modelos/schema';

type AlertaInterna = Alerta & {
  claveDedupeActiva?: string;
  eventKeys?: string[];
};

@Injectable()
export class AlertasRepository {
  constructor(
    @InjectModel(Alerta.name)
    private readonly model: Model<AlertaDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Alerta>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Alerta> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreateAlerta): Promise<Alerta> {
    const payload: Record<string, any> = { ...data };
    if (this.esAlertaActivaIdentificable(data)) {
      await this.garantizarIndiceDedupe();
      payload.claveDedupeActiva = this.claveActiva(
        data.idSiembra,
        data.dedupeKey,
      );
      payload.eventKeys = this.eventKeysDesdeAlerta(data);
    }
    return await this.model.create(payload);
  }

  async bulk(data: ICreateAlerta[]): Promise<Alerta[]> {
    // Mantiene la misma garantia que create. insertMany sin la clave interna
    // permitiria saltear accidentalmente el indice de unicidad.
    return await Promise.all(data.map((item) => this.create(item)));
  }

  async update(id: string, data: IUpdateAlerta): Promise<Alerta> {
    const update: Record<string, any> = { $set: { ...data } };

    if (data.activa === false) {
      update.$unset = { claveDedupeActiva: '' };
    } else if (
      data.activa === true ||
      data.idSiembra !== undefined ||
      data.dedupeKey !== undefined
    ) {
      await this.garantizarIndiceDedupe();
      const current = (await this.model
        .findById(id)
        .select('+eventKeys')
        .lean()) as AlertaInterna | null;
      if (current) {
        const activa = data.activa ?? current.activa;
        const idSiembra = data.idSiembra ?? current.idSiembra;
        const dedupeKey = data.dedupeKey ?? current.dedupeKey;
        if (activa === true && idSiembra && dedupeKey) {
          update.$set.claveDedupeActiva = this.claveActiva(
            idSiembra,
            dedupeKey,
          );
        }
      }
    }

    return await this.model.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });
  }

  async delete(id: string): Promise<Alerta> {
    return await this.model.findByIdAndDelete(id);
  }

  /**
   * Registra un evento bajo una identidad activa unica. El filtro por
   * eventKeys y el indice sparse unico hacen que dos replicas concurrentes no
   * puedan crear dos alertas ni anexar dos veces el mismo evento.
   */
  async registrarEventoSiembra(
    comando: IRegistrarEventoAlerta,
  ): Promise<IResultadoRegistroEventoAlerta> {
    const alerta = comando.alerta;
    const idSiembra = String(alerta.idSiembra);
    const dedupeKey = String(alerta.dedupeKey);
    const eventKey = String(comando.eventKey);
    const claveDedupeActiva = this.claveActiva(idSiembra, dedupeKey);
    const reporte = {
      ...comando.reporte,
      eventKey,
      dedupeKey,
    };

    // Mongoose crea indices en segundo plano. Esperar init cierra la pequena
    // ventana de despliegue en la que dos requests podrian llegar antes de que
    // Mongo confirme el indice unico. init queda cacheado por el propio model.
    await this.garantizarIndiceDedupe();
    await this.adoptarAlertaHistorica(alerta, claveDedupeActiva);

    for (let intento = 0; intento < 3; intento += 1) {
      try {
        const resultado = (await this.model.findOneAndUpdate(
          {
            claveDedupeActiva,
            eventKeys: { $ne: eventKey },
          },
          {
            $set: this.camposVigentes(alerta, eventKey),
            $setOnInsert: this.camposIniciales(alerta, claveDedupeActiva),
            $push: { reportes: reporte },
            $addToSet: { eventKeys: eventKey },
          },
          {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
            runValidators: true,
            includeResultMetadata: true,
          },
        )) as any;

        if (resultado?.value) {
          const creada =
            resultado.lastErrorObject?.updatedExisting === false ||
            Boolean(resultado.lastErrorObject?.upserted);
          await this.finalizarDuplicadosHistoricos(alerta, resultado.value._id);
          return {
            alerta: resultado.value,
            creada,
            duplicada: false,
          };
        }
      } catch (error) {
        if (!this.esErrorClaveDuplicada(error)) throw error;
      }

      const existente = await this.buscarPorClave(claveDedupeActiva);
      if (existente && this.contieneEvento(existente, eventKey)) {
        await this.finalizarDuplicadosHistoricos(alerta, existente._id);
        return {
          alerta: existente,
          creada: false,
          duplicada: true,
        };
      }
      // Una insercion concurrente con otro eventKey puede ganar el upsert.
      // Reintentamos sobre ese mismo documento; nunca abrimos otra identidad.
    }

    throw new Error(
      `No se pudo consolidar atomicamente la alerta activa ${dedupeKey}`,
    );
  }

  /** Finaliza todas las copias activas equivalentes, incluidas las v3. */
  async finalizarEventoSiembra(
    comando: IFinalizarEventoAlerta,
  ): Promise<number> {
    const equivalentes = this.filtroEquivalentes({
      idSiembra: comando.idSiembra,
      dedupeKey: comando.dedupeKey,
      descripcion: comando.descripcion,
      titulo: comando.tituloLegado,
      categoria: comando.dedupeKey?.includes(':sanitaria:')
        ? 'sanitaria'
        : undefined,
    });
    const result = await this.model.updateMany(
      {
        idSiembra: comando.idSiembra,
        activa: true,
        ...equivalentes,
      },
      {
        $set: {
          activa: false,
          estadoActual: 'Finalizada',
          fechaVencimiento: comando.fecha,
        },
        $unset: { claveDedupeActiva: '' },
        $push: {
          estados: {
            fecha: comando.fecha,
            estado: 'Finalizada',
            comentario: comando.comentario,
          },
        },
      },
    );
    return result.modifiedCount || 0;
  }

  async finalizarTodasPorSiembra(
    idSiembra: string,
    comentario: string,
    fecha = new Date().toISOString(),
  ): Promise<number> {
    const result = await this.model.updateMany(
      { idSiembra, activa: true },
      {
        $set: {
          activa: false,
          estadoActual: 'Finalizada',
          fechaVencimiento: fecha,
        },
        $unset: { claveDedupeActiva: '' },
        $push: {
          estados: {
            fecha,
            estado: 'Finalizada',
            comentario,
          },
        },
      },
    );
    return result.modifiedCount || 0;
  }

  private async adoptarAlertaHistorica(
    alerta: ICreateAlerta,
    claveDedupeActiva: string,
  ): Promise<void> {
    const vigente = await this.buscarPorClave(claveDedupeActiva);
    if (vigente) {
      const eventKeys = this.eventKeysDesdeAlerta(vigente);
      const faltantes = eventKeys.filter(
        (eventKey) => !(vigente.eventKeys || []).includes(eventKey),
      );
      if (faltantes.length > 0) {
        await this.model.updateOne(
          { _id: vigente._id, activa: true },
          { $addToSet: { eventKeys: { $each: faltantes } } },
        );
      }
      return;
    }

    const candidata = (await this.model
      .findOne({
        idSiembra: alerta.idSiembra,
        activa: true,
        ...this.filtroEquivalentes(alerta),
      })
      .sort({ fechaUltimoEvento: -1, fecha: -1, _id: -1 })
      .select('+eventKeys')
      .lean()) as AlertaInterna | null;
    if (!candidata?._id) return;

    const eventKeys = this.eventKeysDesdeAlerta(candidata);
    try {
      await this.model.findOneAndUpdate(
        {
          _id: candidata._id,
          activa: true,
          $or: [
            { claveDedupeActiva: { $exists: false } },
            { claveDedupeActiva: null },
          ],
        },
        {
          $set: {
            claveDedupeActiva,
            dedupeKey: alerta.dedupeKey,
            eventKeys,
          },
        },
        { new: true },
      );
    } catch (error) {
      // Otra replica adopto esta identidad. El indice unico determina cual es
      // la canonica y el flujo principal continuara sobre ella.
      if (!this.esErrorClaveDuplicada(error)) throw error;
    }
  }

  private async finalizarDuplicadosHistoricos(
    alerta: ICreateAlerta,
    idCanonica: string,
  ): Promise<void> {
    const fecha = new Date().toISOString();
    await this.model.updateMany(
      {
        _id: { $ne: idCanonica },
        idSiembra: alerta.idSiembra,
        activa: true,
        ...this.filtroEquivalentes(alerta),
      },
      {
        $set: {
          activa: false,
          estadoActual: 'Finalizada',
          fechaVencimiento: fecha,
        },
        $unset: { claveDedupeActiva: '' },
        $push: {
          estados: {
            fecha,
            estado: 'Finalizada',
            comentario: `Consolidada automaticamente en la alerta ${idCanonica}; el historial permanece archivado.`,
          },
        },
      },
    );
  }

  private async buscarPorClave(
    claveDedupeActiva: string,
  ): Promise<AlertaInterna | null> {
    return (await this.model
      .findOne({ claveDedupeActiva })
      .select('+eventKeys')
      .lean()) as AlertaInterna | null;
  }

  private contieneEvento(alerta: AlertaInterna, eventKey: string): boolean {
    return (
      (alerta.eventKeys || []).includes(eventKey) ||
      (alerta.reportes || []).some(
        (reporte) => String(reporte?.eventKey || '') === eventKey,
      )
    );
  }

  private filtroEquivalentes(alerta: Partial<Alerta>): Record<string, any> {
    const alternativas: Record<string, any>[] = [];
    if (alerta.dedupeKey) alternativas.push({ dedupeKey: alerta.dedupeKey });

    const sanitaria =
      alerta.categoria === 'sanitaria' ||
      String(alerta.dedupeKey || '').includes(':sanitaria:');
    if (sanitaria && alerta.titulo) {
      alternativas.push({
        descripcion: 'Riesgo de Enfermedad',
        titulo: alerta.titulo,
      });
    }

    if (alternativas.length === 0 && alerta.descripcion) {
      alternativas.push({ descripcion: alerta.descripcion });
    }
    if (alternativas.length === 0) {
      // Defensa ante comandos incompletos: una identidad vacia nunca debe
      // transformarse en un updateMany general.
      return { _id: { $exists: false } };
    }
    return alternativas.length === 1 ? alternativas[0] : { $or: alternativas };
  }

  private camposVigentes(
    alerta: ICreateAlerta,
    eventKey: string,
  ): Record<string, any> {
    return this.definidos({
      activa: true,
      descripcion: alerta.descripcion,
      titulo: alerta.titulo,
      tipo: alerta.tipo,
      categoria: alerta.categoria,
      severidad: alerta.severidad,
      prioridad: alerta.prioridad,
      origen: alerta.origen,
      motor: alerta.motor,
      versionMotor: alerta.versionMotor,
      eventKey,
      dedupeKey: alerta.dedupeKey,
      lectura: alerta.lectura,
      recomendacion: alerta.recomendacion,
      accionSugerida: alerta.accionSugerida,
      calidadDatos: alerta.calidadDatos,
      canales: alerta.canales,
      fechaUltimoEvento: alerta.fechaUltimoEvento || alerta.fecha,
    });
  }

  private camposIniciales(
    alerta: ICreateAlerta,
    claveDedupeActiva: string,
  ): Record<string, any> {
    return this.definidos({
      claveDedupeActiva,
      idSiembra: alerta.idSiembra,
      idDistribuidor: alerta.idDistribuidor,
      idEstablecimiento: alerta.idEstablecimiento,
      idProductor: alerta.idProductor,
      idQuimica: alerta.idQuimica,
      fecha: alerta.fecha,
      estadoActual: alerta.estadoActual || 'Nueva',
      estados:
        alerta.estados && alerta.estados.length > 0
          ? alerta.estados
          : [
              {
                fecha: alerta.fecha,
                estado: 'Nueva',
              },
            ],
    });
  }

  private eventKeysDesdeAlerta(alerta: Partial<AlertaInterna>): string[] {
    return Array.from(
      new Set(
        [
          ...(alerta.eventKeys || []),
          alerta.eventKey,
          ...(alerta.reportes || []).map((reporte) => reporte?.eventKey),
        ]
          .map((value) => String(value || '').trim())
          .filter(Boolean),
      ),
    );
  }

  private esAlertaActivaIdentificable(
    alerta: Partial<Alerta>,
  ): alerta is Partial<Alerta> & { idSiembra: string; dedupeKey: string } {
    return Boolean(
      alerta.activa === true && alerta.idSiembra && alerta.dedupeKey,
    );
  }

  private claveActiva(idSiembra?: string, dedupeKey?: string): string {
    return createHash('sha256')
      .update(`${String(idSiembra)}\u001f${String(dedupeKey)}`)
      .digest('hex');
  }

  private esErrorClaveDuplicada(error: unknown): boolean {
    return Number((error as any)?.code) === 11000;
  }

  private async garantizarIndiceDedupe(): Promise<void> {
    const init = (this.model as any)?.init;
    if (typeof init === 'function') {
      await init.call(this.model);
    }
  }

  private definidos(data: Record<string, any>): Record<string, any> {
    return Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    );
  }
}
