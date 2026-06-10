import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { IListado, IQueryParam, ICreateTokenPush } from 'modelos/src';
import { Model } from 'mongoose';
import { dbQuery } from 'src/auxiliares/helper.service';
import { TokenPush, TokenPushDocument } from './modelos/schema';

@Injectable()
export class TokenPushsRepository {
  constructor(
    @InjectModel(TokenPush.name)
    private readonly model: Model<TokenPushDocument>,
  ) {}

  async getFilter(params: IQueryParam): Promise<IListado<TokenPush>> {
    return await dbQuery(this.model, params);
  }

  async getById(id: string): Promise<TokenPush> {
    return await this.model.findById(id).lean();
  }

  async create(data: ICreateTokenPush): Promise<TokenPush> {
    return await this.model.create(data);
  }

  async upsert(data: ICreateTokenPush): Promise<TokenPush> {
    return await this.model
      .findOneAndUpdate({ tokenPush: data.tokenPush }, data, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      })
      .lean();
  }

  async bulk(data: ICreateTokenPush[]): Promise<TokenPush[]> {
    return await this.model.insertMany(data, { ordered: false });
  }

  async delete(id: string): Promise<TokenPush> {
    return await this.model.findByIdAndDelete(id);
  }
}
