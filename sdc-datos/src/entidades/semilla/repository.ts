import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IResistencia,
  ISemilla,
  IListado,
  IUpdateSemilla,
  IQueryParam,
  ICreateSemilla,
} from 'modelos/src';
import { Model, UpdateQuery } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Semilla, SemillaDocument } from './modelos/schema';

type CatalogIdentityGuard = Partial<
  Pick<ISemilla, 'cultivo' | 'semillero' | 'variedad' | 'ciclo' | 'campania'>
>;

@Injectable()
export class SemillasRepository {
  constructor(
    @InjectModel(Semilla.name)
    private readonly model: Model<SemillaDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<Semilla>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<Semilla> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreateSemilla): Promise<Semilla> {
    return await this.model.create(data);
  }

  async bulk(data: ICreateSemilla[]): Promise<Semilla[]> {
    return await this.model.insertMany(data, { ordered: false });
  }

  async getAllForCatalogImport(): Promise<Semilla[]> {
    return await this.model.find({}).lean();
  }

  async validateCatalogDocument(data: Partial<ISemilla>): Promise<void> {
    const document = new this.model(data);
    await document.validate();
  }

  async createCatalogDocument(data: ICreateSemilla): Promise<Semilla> {
    return await this.model.create(data);
  }

  /**
   * Compare-and-set limitado a la matriz sanitaria. El filtro impide pisar una
   * edición sanitaria concurrente y el $set no toca fenología, parámetros
   * térmicos, ficha varietal ni ningún otro campo oculto.
   */
  async replaceCatalogResistance(
    id: string,
    expectedIdentity: CatalogIdentityGuard,
    expected: IResistencia[],
    replacement: IResistencia[],
  ): Promise<Semilla | null> {
    const filter: Record<string, unknown> = { _id: id, resistencia: expected };
    for (const field of [
      'cultivo',
      'semillero',
      'variedad',
      'ciclo',
      'campania',
    ] as const) {
      filter[field] = Object.prototype.hasOwnProperty.call(
        expectedIdentity,
        field,
      )
        ? expectedIdentity[field]
        : { $exists: false };
    }
    return await this.model.findOneAndUpdate(
      filter,
      { $set: { resistencia: replacement } },
      { new: true, runValidators: true },
    );
  }

  /**
   * El rollback de un alta sólo elimina el documento si todos los campos del
   * catálogo siguen iguales a los que dejó la importación. Así no se borra una
   * edición posterior realizada por otro proceso.
   */
  async deleteCreatedCatalogDocument(
    id: string,
    expected: Partial<ISemilla> & { __v?: number },
  ): Promise<boolean> {
    const guardedFields = [
      'codigoCarga',
      'fuenteBase',
      'semillero',
      'cultivo',
      'variedad',
      'ciclo',
      'resistencia',
      'campania',
      'tipoCultivo',
      'portainjerto',
      'requerimientoFrio',
      'fenologiaReferencia',
      'sensibilidadHelada',
      'fichaVarietal',
      'parametrosAgrometeorologicos',
      'observaciones',
    ] as const;
    const filter: Record<string, unknown> = { _id: id };
    for (const field of guardedFields) {
      filter[field] = Object.prototype.hasOwnProperty.call(expected, field)
        ? expected[field]
        : { $exists: false };
    }
    if (Object.prototype.hasOwnProperty.call(expected, '__v')) {
      filter.__v = expected.__v;
    }
    const result = await this.model.deleteOne(filter);
    return result.deletedCount === 1;
  }

  async update(
    id: string,
    data: IUpdateSemilla,
    unsetPaths: string[] = [],
  ): Promise<Semilla> {
    const $set = this.buildSet(data);
    const normalizedUnsetPaths = [...new Set(unsetPaths.filter(Boolean))]
      .sort(
        (left, right) =>
          left.split('.').length - right.split('.').length ||
          left.localeCompare(right),
      )
      .filter(
        (path, index, paths) =>
          !paths
            .slice(0, index)
            .some((parent) => path.startsWith(`${parent}.`)),
      );
    for (const path of normalizedUnsetPaths) {
      for (const setPath of Object.keys($set)) {
        if (setPath === path || setPath.startsWith(`${path}.`)) {
          delete $set[setPath];
        }
      }
    }
    const $unset = Object.fromEntries(
      normalizedUnsetPaths.map((path) => [path, 1]),
    );
    const update: UpdateQuery<Semilla> = {};
    if (Object.keys($set).length) {
      update.$set = $set;
    }
    if (Object.keys($unset).length) {
      update.$unset = $unset;
    }
    return await this.model.findByIdAndUpdate(id, update, {
      new: true,
    });
  }

  private buildSet(data: IUpdateSemilla): Record<string, unknown> {
    const set: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data || {})) {
      if (value === undefined) {
        continue;
      }
      if (
        key === 'parametrosAgrometeorologicos' &&
        value &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          if (nestedValue !== undefined) {
            set[`parametrosAgrometeorologicos.${nestedKey}`] = nestedValue;
          }
        }
        continue;
      }
      set[key] = value;
    }
    return set;
  }

  async delete(id: string): Promise<Semilla> {
    return await this.model.findByIdAndDelete(id);
  }
}
