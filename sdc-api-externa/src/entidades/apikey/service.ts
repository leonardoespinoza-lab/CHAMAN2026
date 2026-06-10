import { Injectable, UnauthorizedException } from '@nestjs/common';
import { IApikey, IFilter, IProductor } from 'modelos/src';
import { ApiKeyRepository } from './repository';
import { randomUUID } from 'crypto';

@Injectable()
export class ApiKeysService {
  constructor(private repository: ApiKeyRepository) {}

  async getByApikey(key: string): Promise<IApikey> {
    const filter: IFilter<IApikey> = { key };
    const query = { filter: JSON.stringify(filter), limit: 1 };
    const resp = await this.repository.get(query);
    const apikey = resp.datos[0];
    if (!apikey) {
      throw new UnauthorizedException(`Apikey ${key} inválida`);
    }

    return apikey;
  }

  async getOrCreate(productor: IProductor): Promise<IApikey> {
    const filter: IFilter<IApikey> = {
      'permiso.idProductor': productor._id,
    } as any;
    const query = { filter: JSON.stringify(filter), limit: 1 };
    const apikeys = await this.repository.get(query);
    const existe = apikeys.datos[0];
    if (existe) {
      return existe;
    }

    const create: IApikey = {
      permiso: {
        idProductor: productor._id,
        idDistribuidor: productor.idDistribuidor,
        idQuimica: productor.idQuimica,
        nivel: 'Productor',
        rol: 'Admin',
      },
      key: randomUUID(),
      identificacion: `key de ${productor.nombre}`,
    };
    return await this.repository.create(create);
  }
}
