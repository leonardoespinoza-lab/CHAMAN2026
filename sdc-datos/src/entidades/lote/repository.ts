import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateLote,
  IQueryParam,
  ICreateLote,
  DeleteResult,
  ISolicitudArchivado,
  IDispositivo,
  serviciosDispositivoNormalizados,
  SensoresV2,
} from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Lote, LoteDocument } from './modelos/schema';
import {
  Dispositivo,
  DispositivoDocument,
} from '../dispositivos/modelos/schema';

@Injectable()
export class LotesRepository {
  constructor(
    @InjectModel(Lote.name)
    private readonly model: Model<LoteDocument>,
    @InjectModel(Dispositivo.name)
    private readonly dispositivoModel: Model<DispositivoDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Lote>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Lote> {
    const lote = await this.model
      .findById(id)
      .populate([
        {
          path: 'establecimiento',
          populate: {
            path: 'estacionMeteorologica',
          },
        },
        { path: 'departamento' },
      ])
      .populate({
        path: 'siembra',
        populate: ['semilla', 'crono', 'departamento'],
      })
      .lean();
    if (!lote) return lote;

    const dispositivos = await this.dispositivoModel
      .find({
        $or: [
          { 'servicios.idLote': id },
          {
            idLote: id,
            $or: [{ servicios: { $exists: false } }],
          },
        ],
      })
      .lean();
    (lote as any).dispositivos = dispositivos.map((dispositivo) =>
      this.filtrarDispositivoParaLote(dispositivo, id),
    );
    return lote;
  }

  private filtrarDispositivoParaLote(
    dispositivo: IDispositivo,
    idLote: string,
  ): IDispositivo {
    const explicitos = dispositivo.servicios?.length
      ? dispositivo.servicios.filter(
          (servicio) =>
            servicio.habilitado !== false &&
            String(servicio.idLote || '') === String(idLote),
        )
      : [];
    const tieneServiciosExplicitos = Array.isArray(dispositivo.servicios);
    const servicios = tieneServiciosExplicitos
      ? explicitos
      : String(dispositivo.idLote || '') === String(idLote)
        ? serviciosDispositivoNormalizados(dispositivo)
        : [];
    const sensoresPermitidos = new Set<SensoresV2>(['Batería']);
    servicios.forEach((servicio) =>
      servicio.sensores.forEach((sensor) => sensoresPermitidos.add(sensor)),
    );
    const valores = dispositivo.ultimoReporte?.datos?.valores || {};
    const valoresFiltrados = Object.fromEntries(
      Object.entries(valores).filter(([sensor]) =>
        sensoresPermitidos.has(sensor as SensoresV2),
      ),
    );
    const tiposVisibles = new Set(servicios.map((servicio) => servicio.tipo));

    return {
      ...dispositivo,
      servicios,
      sensores: (dispositivo.sensores || []).filter((sensor) =>
        sensoresPermitidos.has(sensor),
      ),
      configuracionLecturas: dispositivo.configuracionLecturas
        ? {
            perfilSuelo: tiposVisibles.has('perfil_suelo')
              ? dispositivo.configuracionLecturas.perfilSuelo
              : undefined,
            entradaAnalogica: tiposVisibles.has('nivel_napa')
              ? dispositivo.configuracionLecturas.entradaAnalogica
              : undefined,
          }
        : undefined,
      ultimoReporte: dispositivo.ultimoReporte
        ? {
            ...dispositivo.ultimoReporte,
            datos: { valores: valoresFiltrados },
          }
        : undefined,
    };
  }

  async create(data: ICreateLote): Promise<Lote> {
    return await this.model.create(data);
  }

  async update(id: string, data: IUpdateLote): Promise<Lote> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string, audit: ISolicitudArchivado = {}): Promise<Lote> {
    return await this.model
      .findByIdAndUpdate(
        id,
        {
          archivado: true,
          fechaArchivado: new Date(),
          archivadoPor: audit.archivadoPor || 'sistema',
          motivoArchivado: audit.motivoArchivado || 'Archivado desde Chaman',
        },
        { new: true },
      )
      .lean();
  }

  async deleteMany(query: IQueryParam): Promise<DeleteResult> {
    const filter = JSON.parse(query.filter);
    const result = await this.model.updateMany(filter, {
      $set: {
        archivado: true,
        fechaArchivado: new Date(),
        archivadoPor: query.archivadoPor || 'sistema',
        motivoArchivado:
          query.motivoArchivado || 'Archivado masivo desde Chaman',
      },
    });
    return {
      acknowledged: result.acknowledged,
      deletedCount: result.modifiedCount,
    };
  }
}
