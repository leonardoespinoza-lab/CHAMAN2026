import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ICreateClient } from 'modelos/src';
import { Model } from 'mongoose';
import { UsuariosService } from '../usuario/service';
import { Client, ClientDocument } from './client.model';
import { CreateToken } from './token.inputs';
import { Token, TokenDocument } from './token.model';

@Injectable()
export class OauthService {
  constructor(
    @InjectModel(Token.name) private tokenModel: Model<TokenDocument>,
    @InjectModel(Client.name) private clientModel: Model<ClientDocument>,
    private usuariosService: UsuariosService,
  ) {}

  // Client

  async getClient(
    clientId: string,
    clientSecret: string,
  ): Promise<ClientDocument> {
    const res = await this.clientModel
      .findOne({ id: clientId, clientSecret })
      .lean();
    return res as any;
  }

  async createClient(dato: ICreateClient): Promise<ClientDocument> {
    const doc = new this.clientModel(dato);
    return await doc.save();
  }

  // Usuario

  async getUsuario(username: string) {
    try {
      return await this.usuariosService.getForLogin(username);
    } catch (err) {
      return;
    }
  }

  // Token

  async getAccessToken(accessToken: string): Promise<TokenDocument> {
    return await this.tokenModel.findOne({ accessToken });
  }

  async getRefreshToken(refreshToken: string): Promise<TokenDocument> {
    return await this.tokenModel.findOne({ refreshToken });
  }

  async saveToken(dato: CreateToken): Promise<TokenDocument> {
    const doc = new this.tokenModel(dato);
    return await doc.save();
  }

  async revokeToken(token: CreateToken): Promise<boolean> {
    const deleted = await this.tokenModel.findOneAndDelete({
      accessToken: token.accessToken,
    });
    if (deleted) {
      return true;
    }
  }
}
