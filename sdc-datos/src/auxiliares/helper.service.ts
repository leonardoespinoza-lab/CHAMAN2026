import mongoose, { Model } from 'mongoose';
import { IListado, IQueryParam } from 'modelos/src';
import { Logger } from '@nestjs/common';

function getPopulate(populate?: string): Record<string, any> | string {
  //Record<string, any> | string
  if (!populate) return '';
  if (populate)
    try {
      const parsed = JSON.parse(populate);
      if (Object.keys(parsed).length === 0) {
        return '';
      } else {
        return parsed;
      }
    } catch (e) {
      return populate || '';
    }
}

function getSort(sort?: string): Record<string, any> | string {
  try {
    return sort ? JSON.parse(sort) : '';
  } catch (e) {
    return sort || '';
  }
}

function getFilters(filter?: string) {
  try {
    return filter ? JSON.parse(filter) : {};
  } catch (e) {
    Logger.error(`Error al parsear el filtro: ${filter}`);
    return {};
  }
}

export async function dbQuery<Type>(
  model: Model<Type>,
  query?: IQueryParam,
): Promise<IListado<Type>> {
  // const limit = +query?.limit || 100;
  const limit = query?.limit || query?.limit === 0 ? +query?.limit : 0;
  const page = +query?.page || 0;
  const skip = limit * page;
  const sort = query?.sort || '_id';
  const filter = getFilters(query.filter);
  const populate = getPopulate(query?.populate);
  const select = query?.select || '';
  const [totalCount, datos] = await Promise.all([
    model.countDocuments(filter),
    model
      .find(filter)
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .select(select)
      .populate(populate as any),
  ]);
  return { totalCount, datos: datos as Type[] };
}

export function stringsToObjectId(ids: string[]) {
  return ids.map((id) => new mongoose.Types.ObjectId(id));
}

export function stringToObjectId(id: string) {
  return new mongoose.Types.ObjectId(id);
}
