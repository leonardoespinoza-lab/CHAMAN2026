import { Injectable, Logger } from '@nestjs/common';
import {
  ISiembra,
  IQueryParam,
  ICreateSiembra,
  IUpdateSiembra,
  ICrono,
  IApikey,
} from 'modelos/src';
import { CronosService } from '../crono/service';
import { PrediccionsService } from '../prediccion/service';
import { SemillasService } from '../semilla/service';
import { SiembrasRepository } from './repository';
import { LotesService } from '../lote/service';
@Injectable()
export class SiembrasService {
  constructor(
    private repository: SiembrasRepository,
    private prediccionsService: PrediccionsService,
    private semillasService: SemillasService,
    private cronosService: CronosService,
    private lotesService: LotesService,
  ) {}

  async getById(id: string, apikey: IApikey): Promise<ISiembra> {
    const siembra = await this.repository.getById(id);
    if (apikey.permiso.nivel === 'Quimica') {
      if (siembra.idQuimica !== apikey.permiso.idQuimica) {
        throw new Error('No tienes permiso para ver esta siembra');
      }
    }
    if (apikey.permiso.nivel === 'Distribuidor') {
      if (siembra.idDistribuidor !== apikey.permiso.idDistribuidor) {
        throw new Error('No tienes permiso para ver esta siembra');
      }
    }
    if (apikey.permiso.nivel === 'Productor') {
      if (siembra.idProductor !== apikey.permiso.idProductor) {
        throw new Error('No tienes permiso para ver esta siembra');
      }
    }
    return siembra;
  }

  async create(data: ICreateSiembra): Promise<ISiembra> {
    const crono = await this.getCrono(data);
    data.idCrono = crono?._id;
    const created = await this.repository.create(data);
    await this.prediccionsService.prediccion(created._id);
    return created;
  }

  async cosechar(id: string, fecha: string): Promise<ISiembra> {
    // Traigo la siembra a cosechar
    const siembra = await this.repository.getById(id);
    // Actualizo los suelos del lote de la siembra
    const lote = await this.lotesService.getById(siembra.idLote);
    if (!lote) {
      console.debug('No se encontró el lote de la siembra');
    } else {
      if (!lote.suelos) {
        console.debug('No se encontraron los suelos del lote');
      } else {
        for (const l of lote.suelos) {
          l.hayRaices = false;
        }
        await this.lotesService.update(lote._id, lote);
      }
    }
    // Actualizo la siembra
    siembra.fechaCosecha = fecha;
    siembra.activa = false;
    return await this.repository.update(id, siembra);
  }

  async update(id: string, data: IUpdateSiembra): Promise<ISiembra> {
    const crono = await this.getCrono(data);
    data.idCrono = crono?._id;
    const updated = await this.repository.update(id, data);
    await this.actualizarPrediccion(id);
    return updated;
  }

  async delete(id: string): Promise<ISiembra> {
    await this.prediccionsService.deleteByIdSiembra(id);
    const siembra = await this.repository.getById(id);
    // Actualizo los suelos del lote de la siembra
    const lote = await this.lotesService.getById(siembra.idLote);
    if (!lote) {
      console.debug('No se encontró el lote de la siembra');
    } else {
      if (!lote.suelos) {
        console.debug('No se encontraron los suelos del lote');
      } else {
        for (const l of lote.suelos) {
          l.hayRaices = false;
        }
        await this.lotesService.update(lote._id, lote);
      }
    }
    return await this.repository.delete(id);
  }

  // Private

  private async actualizarPrediccion(idSiembra: string) {
    try {
      await this.prediccionsService.deleteByIdSiembra(idSiembra);
    } catch (error) {
      Logger.error(error);
    }

    try {
      await this.prediccionsService.prediccion(idSiembra);
    } catch (error) {
      Logger.error(error);
    }
  }

  private async getCrono(
    siembra: ICreateSiembra | IUpdateSiembra,
  ): Promise<ICrono> {
    const semilla = await this.semillasService.getById(siembra.idSemilla);
    const cultivo = semilla?.cultivo;
    const ciclo = semilla?.ciclo;
    const idDepartamento = siembra.idDepartamento;
    const diaSiembra = new Date(siembra.fechaSiembra).getDate();
    const mesSiembra = new Date(siembra.fechaSiembra).getMonth() + 1;
    const filtro = {
      ciclo: { $regex: `^${ciclo}$`, $options: 'i' },
      idDepartamento,
      diaSiembra,
      mesSiembra,
      cultivo,
    };
    const query: IQueryParam = {
      filter: JSON.stringify(filtro),
    };
    const resp = await this.cronosService.get(query);
    return resp.datos[0];
  }
}
