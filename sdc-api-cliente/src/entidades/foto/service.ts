import { Injectable } from '@nestjs/common';
import { IListado, IQueryParam, IFilter, IPermiso, IFoto, ILote } from 'modelos/src';
import { FotosRepository } from './repository';

@Injectable()
export class FotosService {
  constructor(private repository: FotosRepository) {}

  async getImagen(url: string): Promise<any> {
    const response = await this.repository.getImagen(url);
    return response;
  }

  async getById(id: string, permiso: IPermiso): Promise<IFoto> {
    if (!this.puedeVer(permiso)) {
      throw new Error('No tiene permiso para ver esta foto');
    }
    const data = await this.repository.getById(id);
    return data;
  }

  async getByIdLote(
    idLote: string,
    permiso: IPermiso,
  ): Promise<IListado<IFoto>> {
    const lote = await this.repository.getLoteById(idLote);
    if (!this.puedeVerLote(lote, permiso)) {
      throw new Error('No tiene permiso para ver estas fotos');
    }
    const filter: IFilter<IFoto> = { idLote };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
    };
    const data = await this.repository.get(query);
    return data;
  }

  async get(query: IQueryParam, permiso: IPermiso): Promise<IListado<IFoto>> {
    if (!this.puedeVer(permiso)) {
      throw new Error('No tiene permiso para ver estas fotos');
    }
    return await this.repository.get(query);
  }

  async delete(id: string, permiso: IPermiso): Promise<IFoto> {
    await this.getById(id, permiso);
    return await this.repository.delete(id);
  }

  // Private

  private puedeVer(permiso: IPermiso): boolean {
    if (permiso.nivel === 'Admin') {
      return true;
    }
    return false;
  }

  private puedeVerLote(lote: ILote, permiso: IPermiso): boolean {
    if (permiso.nivel === 'Admin') return true;
    if (permiso.nivel === 'Quimica') return lote.idQuimica === permiso.idQuimica;
    if (permiso.nivel === 'Distribuidor') return lote.idDistribuidor === permiso.idDistribuidor;
    if (permiso.nivel === 'Productor') return lote.idProductor === permiso.idProductor;
    if (permiso.nivel === 'Establecimiento') return lote.idEstablecimiento === permiso.idEstablecimiento;
    return false;
  }
}
