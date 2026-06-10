export interface IQueryParam {
  page?: string | number;
  limit?: string | number;
  sort?: string;
  filter?: string;
  populate?: string;
  select?: string;
  [key: string]: any;
}
export interface IPopulate {
  path?: string;
  select?: string;
  populate?: IPopulate;
  [key: string]: any;
}

type mongoOperators = {
  $regex?: string;
  $in?: string[];
  $nin?: string[];
  $gte?: number | string;
  $lte?: number | string;
  $gt?: number | string;
  $lt?: number | string;
  $eq?: number | string | boolean | null;
  $ne?: number | string | boolean | null;
  $exists?: boolean;
  [key: string]: any;
};

type mongoFilter = number | string | boolean | null | mongoOperators;

export type IFilter<T> = {
  [K in keyof T]: undefined | mongoFilter | IFilter<T>[];
} & {
  $or?: IFilter<T>[];
  $and?: IFilter<T>[];
  $nor?: IFilter<T>[];
  $not?: mongoFilter;
};
