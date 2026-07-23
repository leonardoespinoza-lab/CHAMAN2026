import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  ICreateTenant,
  IListado,
  IQueryParam,
  ISolicitudArchivado,
  IUpdateTenant,
} from 'modelos/src';
import { Model, Types } from 'mongoose';
import { dbQuery } from '../../auxiliares/helper.service';
import { Token, TokenDocument } from '../oauth/token.model';
import {
  Usuario,
  UsuarioDocument,
} from '../usuario/modelos/schema';
import { Tenant, TenantDocument } from './modelos/schema';

@Injectable()
export class TenantsRepository {
  constructor(
    @InjectModel(Tenant.name)
    private readonly model: Model<TenantDocument>,
    @InjectModel(Usuario.name)
    private readonly userModel: Model<UsuarioDocument>,
    @InjectModel(Token.name)
    private readonly tokenModel: Model<TokenDocument>,
  ) {}

  get(params: IQueryParam): Promise<IListado<Tenant>> {
    return dbQuery(this.model, params);
  }

  getById(id: string): Promise<Tenant> {
    return this.model.findById(id).lean();
  }

  getBySlug(slug: string): Promise<Tenant> {
    return this.model.findOne({ slug }).lean();
  }

  create(data: ICreateTenant): Promise<Tenant> {
    return this.model.create(data);
  }

  update(id: string, data: IUpdateTenant): Promise<Tenant> {
    return this.model
      .findByIdAndUpdate(
        id,
        { ...data, fechaActualizacion: new Date() },
        { new: true, runValidators: true },
      )
      .lean();
  }

  archive(id: string, audit: ISolicitudArchivado = {}): Promise<Tenant> {
    return this.archiveTenantAndSubjects(id, audit);
  }

  async countActiveByIds(ids: string[]): Promise<number> {
    return await this.model.countDocuments({
      _id: { $in: ids },
      estado: 'activo',
      archivado: { $ne: true },
    });
  }

  private async archiveTenantAndSubjects(
    id: string,
    audit: ISolicitudArchivado = {},
  ): Promise<Tenant> {
    const archivedAt = new Date();
    const archivedBy = audit.archivadoPor || 'sistema';
    const reason =
      audit.motivoArchivado || 'Tenant archivado desde Chaman';
    const tenant = await this.model
      .findByIdAndUpdate(
        id,
        {
          estado: 'archivado',
          archivado: true,
          fechaArchivado: archivedAt,
          archivadoPor: archivedBy,
          motivoArchivado: reason,
          fechaActualizacion: archivedAt,
        },
        { new: true },
      )
      .lean();

    // The tenant is blocked first. If either of the following idempotent
    // operations is interrupted, every token is rejected by the live
    // eligibility check and a retry completes the cleanup.
    const tenantIds: Array<string | Types.ObjectId> = [id];
    if (Types.ObjectId.isValid(id)) {
      tenantIds.push(new Types.ObjectId(id));
    }
    const userIds = await this.userModel.distinct('_id', {
      'permisos.idTenant': { $in: tenantIds },
    });
    if (userIds.length) {
      await this.userModel.updateMany(
        {
          _id: { $in: userIds },
          'permisos.idTenant': { $in: tenantIds },
          $or: [
            { activo: { $ne: false } },
            { archivado: { $ne: true } },
          ],
        },
        {
          $set: {
            activo: false,
            archivado: true,
            fechaArchivado: archivedAt,
            archivadoPor: archivedBy,
            motivoArchivado: reason,
          },
        },
      );
      const tokenUserIds = Array.from(
        new Set(userIds.flatMap((userId) => [userId, String(userId)])),
      );
      await this.tokenModel.deleteMany({
        'user._id': { $in: tokenUserIds },
      });
    }

    return tenant;
  }
}
