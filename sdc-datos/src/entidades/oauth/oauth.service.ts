import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ICreateClient, IUsuario } from 'modelos/src';
import { Model } from 'mongoose';
import { UsuariosService } from '../usuario/service';
import { Client, ClientDocument } from './client.model';
import { CreateToken, RevokeToken } from './token.inputs';
import { Token, TokenDocument } from './token.model';
import { TenantsService } from '../tenant/service';

export interface SessionEligibility {
  eligible: boolean;
  user?: IUsuario;
  reason?:
    | 'user_not_found'
    | 'user_inactive'
    | 'permissions_missing'
    | 'tenant_inactive';
}

@Injectable()
export class OauthService {
  constructor(
    @InjectModel(Token.name) private tokenModel: Model<TokenDocument>,
    @InjectModel(Client.name) private clientModel: Model<ClientDocument>,
    private usuariosService: UsuariosService,
    private tenantsService: TenantsService,
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

  async getSessionEligibility(idUsuario: string): Promise<SessionEligibility> {
    let user: IUsuario;
    try {
      user = await this.usuariosService.getById(idUsuario);
    } catch (error) {
      const status = Number(
        (error as any)?.getStatus?.() || (error as any)?.status || 0,
      );
      if (status === 404) {
        return { eligible: false, reason: 'user_not_found' };
      }
      throw error;
    }
    if (!user || user.activo === false || user.archivado === true) {
      return { eligible: false, reason: 'user_inactive' };
    }
    if (!Array.isArray(user.permisos) || !user.permisos.length) {
      return { eligible: false, reason: 'permissions_missing' };
    }

    const tenantIds = Array.from(
      new Set(
        user.permisos
          .map((permission) => String(permission?.idTenant || '').trim())
          .filter(Boolean),
      ),
    );
    if (
      tenantIds.length &&
      !(await this.tenantsService.areAllActive(tenantIds))
    ) {
      return { eligible: false, reason: 'tenant_inactive' };
    }

    return { eligible: true, user };
  }

  // Token

  async getAccessToken(accessToken: string): Promise<TokenDocument> {
    return await this.tokenModel.findOne({
      accessToken,
      accessTokenExpiresAt: { $gt: new Date() },
      $or: [
        { sessionAbsoluteExpiresAt: { $exists: false } },
        { sessionAbsoluteExpiresAt: { $gt: new Date() } },
      ],
    });
  }

  async getRefreshToken(refreshToken: string): Promise<TokenDocument> {
    return await this.tokenModel.findOne({
      refreshToken,
      refreshTokenExpiresAt: { $gt: new Date() },
      $or: [
        { sessionAbsoluteExpiresAt: { $exists: false } },
        { sessionAbsoluteExpiresAt: { $gt: new Date() } },
      ],
    });
  }

  async saveToken(dato: CreateToken): Promise<TokenDocument> {
    const doc = new this.tokenModel(dato);
    return await doc.save();
  }

  async revokeToken(token: RevokeToken): Promise<boolean> {
    const clauses = [];
    if (token.accessToken) clauses.push({ accessToken: token.accessToken });
    if (token.refreshToken) clauses.push({ refreshToken: token.refreshToken });
    if (!clauses.length) return false;
    const deleted = await this.tokenModel.deleteMany({ $or: clauses });
    return deleted.deletedCount > 0;
  }

  async revokeUserSessions(idUsuario: string): Promise<number> {
    if (!idUsuario) return 0;
    const deleted = await this.tokenModel.deleteMany({
      'user._id': idUsuario,
    });
    return deleted.deletedCount;
  }
}
