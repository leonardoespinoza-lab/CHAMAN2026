import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateReporteNDVI,
  IQueryParam,
  ICreateReporteNDVI,
  IReporteNDVI,
  DeleteResult,
} from 'modelos/src';
import { Model, PipelineStage } from 'mongoose';
import { dbQuery, stringToObjectId } from 'src/auxiliares/helper.service';
import { ReporteNDVI, ReporteNDVIDocument } from './modelos/schema';

export type TReporteNdviTenantScope =
  | 'quimica'
  | 'distribuidor'
  | 'productor'
  | 'establecimiento';

@Injectable()
export class ReporteNDVIsRepository {
  constructor(
    @InjectModel(ReporteNDVI.name)
    private readonly model: Model<ReporteNDVIDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<IReporteNDVI>> {
    return await dbQuery(this.model, params);
  }

  async getLastByIdProductor(idProductor: string) {
    const pipeline: PipelineStage[] = [
      {
        $match: {
          idProductor: stringToObjectId(idProductor),
        },
      },
      {
        $sort: {
          fechaCreacion: 1,
        },
      },
      {
        $group: {
          _id: '$idLote',
          lastReporte: { $last: '$$ROOT' },
        },
      },
    ];

    return await this.model.aggregate<IReporteNDVI>(pipeline).exec();
  }

  async getLastByIdDistribuidor(idDistribuidor: string) {
    const pipeline: PipelineStage[] = [
      {
        $match: {
          idDistribuidor: stringToObjectId(idDistribuidor),
        },
      },
      {
        $sort: {
          fechaCreacion: 1,
        },
      },
      {
        $group: {
          _id: '$idLote',
          lastReporte: { $last: '$$ROOT' },
        },
      },
    ];

    return await this.model.aggregate<IReporteNDVI>(pipeline).exec();
  }

  async getLastByScope(scope: TReporteNdviTenantScope, id: string) {
    const fields: Record<TReporteNdviTenantScope, string> = {
      quimica: 'idQuimica',
      distribuidor: 'idDistribuidor',
      productor: 'idProductor',
      establecimiento: 'idEstablecimiento',
    };
    const field = fields[scope];
    const pipeline: PipelineStage[] = [
      {
        $match: {
          [field]: stringToObjectId(id),
        },
      },
      {
        $sort: {
          fechaCreacion: 1,
        },
      },
      {
        $group: {
          _id: '$idLote',
          lastReporte: { $last: '$$ROOT' },
        },
      },
    ];
    return await this.model.aggregate<IReporteNDVI>(pipeline).exec();
  }

  async getLastByIdLote(idLote: string): Promise<IListado<IReporteNDVI>> {
    const pipeline: PipelineStage[] = [
      // 1. Encontrar los reportes del lote
      {
        $match: {
          idLote: stringToObjectId(idLote),
        },
      },
      // 2. Ordenarlos por fecha para saber cuál es el último
      {
        $sort: {
          fechaCreacion: 1, // 1 para ascendente, -1 para descendente
        },
      },
      // 3. Agrupar y obtener el último documento completo
      {
        $group: {
          _id: '$idLote',
          lastReporte: { $last: '$$ROOT' }, // $last toma el último por el $sort
        },
      },
      // 4. Reemplazar la raíz del documento para quedarnos solo con el reporte
      {
        $replaceRoot: { newRoot: '$lastReporte' },
      },
      // 5. Usar $facet para formatear la salida final
      {
        $facet: {
          // La primera "sub-pipeline" crea el array de datos
          datos: [{ $match: {} }], // Simplemente pasamos los documentos que llegaron a esta etapa
          // La segunda "sub-pipeline" cuenta los elementos para totalCount
          metadata: [{ $count: 'total' }],
        },
      },
      // 6. Proyectar para tener una estructura más limpia
      {
        $project: {
          datos: '$datos',
          // Tomamos el 'total' del primer elemento del array de metadata (o 0 si no hay)
          totalCount: { $arrayElemAt: ['$metadata.total', 0] },
        },
      },
    ];

    const result = await this.model.aggregate(pipeline).exec();

    // El resultado de la agregación es un array, usualmente con un solo elemento
    if (result.length > 0) {
      // Devolvemos el primer elemento que ya tiene el formato { datos, totalCount }
      return {
        datos: result[0].datos,
        totalCount: result[0].totalCount || 0,
      };
    }

    // Si no hubo resultados, devolvemos la estructura vacía
    return {
      totalCount: 0,
      datos: [],
    };
  }

  async getLast(): Promise<IListado<IReporteNDVI>> {
    // Magia de GEMINI
    const pipeline: PipelineStage[] = [
      // 1. Ordenar TODOS los reportes por fecha de creación, del más nuevo al más viejo.
      // Es crucial hacerlo primero para que el $group funcione correctamente.
      {
        $sort: {
          fechaCreacion: -1, // -1 para orden descendente (el más nuevo primero)
        },
      },

      // 2. Agrupar por 'idLote'. Para cada lote, nos quedaremos con el PRIMER
      // documento que encontremos, que gracias al $sort, será el más reciente.
      {
        $group: {
          _id: '$idLote', // Agrupamos por el ID del lote
          ultimoReporte: { $first: '$$ROOT' }, // '$$ROOT' es el documento completo $first es el primero encontrado
        },
      },

      // 3. En este punto, tenemos objetos como: { _id: idLote, ultimoReporte: { ... } }
      // Reemplazamos toda la estructura para quedarnos solo con los datos del reporte.
      {
        $replaceRoot: { newRoot: '$ultimoReporte' },
      },

      // 4. Ahora tenemos una lista limpia de los últimos reportes. Usamos $facet
      // para construir la estructura final de `IListado` en un solo paso.
      {
        $facet: {
          // 'datos' contendrá el array de los reportes
          datos: [{ $match: {} }], // Un match vacío para pasar todos los documentos
          // 'metadata' nos ayudará a contar el total de elementos
          metadata: [{ $count: 'total' }],
        },
      },

      // 5. Proyectamos el resultado final para que coincida exactamente con IListado<T>
      {
        $project: {
          datos: '$datos',
          // Extraemos el 'total' del array metadata. Si no hay resultados, será 0.
          totalCount: {
            $ifNull: [{ $arrayElemAt: ['$metadata.total', 0] }, 0],
          },
        },
      },
    ];

    // La agregación devuelve un array con un único elemento que tiene nuestro formato
    const result = await this.model.aggregate(pipeline).exec();

    // Si la consulta no produjo resultados, result estará vacío.
    if (!result || result.length === 0) {
      return { totalCount: 0, datos: [] };
    }

    // Devolvemos el primer (y único) elemento del array, que ya tiene el formato correcto.
    return result[0];
  }

  async getById(id: string): Promise<IReporteNDVI> {
    return await this.model
      .findById(id)
      .populate(
        'productor distribuidor quimica establecimiento lote departamento',
      )
      .lean();
  }

  async create(data: ICreateReporteNDVI): Promise<IReporteNDVI> {
    return await this.model.create(data);
  }

  async update(id: string, data: IUpdateReporteNDVI): Promise<IReporteNDVI> {
    return await this.model.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<IReporteNDVI> {
    return await this.model.findByIdAndDelete(id);
  }

  async deleteMany(query: IQueryParam): Promise<DeleteResult> {
    const filter = JSON.parse(query.filter);
    return await this.model.deleteMany(filter);
  }
}
