import { Injectable } from '@nestjs/common';
import {
  ILote,
  IQueryParam,
  ICreateLote,
  IUpdateLote,
  IEstablecimiento,
  IFilter,
} from 'modelos/src';
import { LotesRepository } from './repository';
import { RequestPrediction } from '../../endpoints/schemas';
import { HelperService } from '../../auxiliares/helper';
import { EstacionsService } from '../estacion/service';

@Injectable()
export class LotesService {
  constructor(
    private repository: LotesRepository,
    private estacionsService: EstacionsService,
  ) {}

  async getById(id: string): Promise<ILote> {
    return await this.repository.getById(id);
  }

  async create(data: ICreateLote): Promise<ILote> {
    return await this.repository.create(data);
  }

  async update(id: string, data: IUpdateLote): Promise<ILote> {
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<ILote> {
    return await this.repository.delete(id);
  }

  async calcularCapacidadCampo(idSonda: string, fecha: string) {
    return await this.repository.calcularCapacidadCampo(idSonda, fecha);
  }

  async getOrCreateByNombre(
    nombre: string,
    establecimiento: IEstablecimiento,
    body: RequestPrediction,
  ): Promise<ILote> {
    const filter: IFilter<ILote> = {
      nombre,
      idEstablecimiento: establecimiento._id,
    };
    const query: IQueryParam = { filter: JSON.stringify(filter), limit: 1 };
    const lotes = await this.repository.get(query);
    const existe = lotes.datos[0];
    if (existe) {
      return existe;
    }

    const create: ICreateLote = {
      nombre,
      idDistribuidor: establecimiento.idDistribuidor,
      idQuimica: establecimiento.idQuimica,
      idProductor: establecimiento.idProductor,
      idDepartamento: body.idDepartamento,
      capacidadDeRiego: body.capacidadDeRiego,
      anchoDeBulbo: 1,
      metrosLinealesHas: 10000,
      idEstablecimiento: establecimiento._id,
    };

    // Si el cliente envia el poligono
    if (body.poligono) {
      create.ubicacion = {
        poligono: body.poligono,
        centro: HelperService.getCentro(body.poligono),
        superficie: HelperService.calcularArea(body.poligono),
      };
      // Si envia solo un punto, se genera un poligono de 10 hectareas
    } else if (body.ubicacion) {
      const poligono = HelperService.generarPoligono10Hectareas(body.ubicacion);
      create.ubicacion = {
        poligono,
        centro: HelperService.getCentro(poligono),
        superficie: HelperService.calcularArea(poligono),
      };
      // Si no envia nada, se genera un poligono aleatorio
    } else {
      const centro = HelperService.generarCoordenadasAleatoriasArgentina();
      const poligono = HelperService.generarPoligono10Hectareas(centro);
      create.ubicacion = {
        poligono,
        centro,
        superficie: HelperService.calcularArea(poligono),
      };
    }

    if (create.ubicacion.centro) {
      const ubicacion = create.ubicacion.centro;
      const sonda = await this.estacionsService.getEstacionSueloCerca({
        ubicacion,
      })[0];
      create.idSondaSuelo = sonda?._id;
    } else {
      const sonda = await this.estacionsService.getEstacionSueloRandom();
      create.idSondaSuelo = sonda?._id;
    }

    return await this.create(create);
  }
}
