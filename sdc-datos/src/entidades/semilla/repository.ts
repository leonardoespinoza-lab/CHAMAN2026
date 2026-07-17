import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IListado,
  IUpdateSemilla,
  IQueryParam,
  ICreateSemilla,
} from 'modelos/src';
import { Model, UpdateQuery } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { Semilla, SemillaDocument } from './modelos/schema';

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
