import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ResponseDiseasePrediction,
  ResponseIrrigationPrediction,
  CreateProducer,
  SowingId,
  Departments,
  Seeds,
  ResponseCreateProducer,
  RequestPrediction,
} from './schemas';
import {
  Cultivo,
  IApikey,
  ICreateSiembra,
  IEstablecimiento,
  IFilter,
  ILote,
  IPopulate,
  ISemilla,
} from 'modelos/src';
import { EstablecimientosService } from '../entidades/establecimiento/service';
import { LotesService } from '../entidades/lote/service';
import { SemillasService } from '../entidades/semilla/service';
import { SiembrasService } from '../entidades/siembra/service';
import { DepartamentosService } from '../entidades/departamento/service';
import { ProductorsService } from '../entidades/productor/service';
import { ApiKeysService } from '../entidades/apikey/service';
import { PrediccionRiegoService } from '../entidades/prediccion-riego/service';
import { PrediccionsService } from '../entidades/prediccion/service';

@Injectable()
export class EndpointsService {
  constructor(
    private establecimientosService: EstablecimientosService,
    private lotesService: LotesService,
    private semillasService: SemillasService,
    private siembrasService: SiembrasService,
    private departamentosService: DepartamentosService,
    private productorsService: ProductorsService,
    private apiKeysService: ApiKeysService,
    private prediccionRiegoService: PrediccionRiegoService,
    private prediccionsService: PrediccionsService,
  ) {}

  public async createProductor(
    body: CreateProducer,
    apikey: IApikey,
  ): Promise<ResponseCreateProducer> {
    // Saco la comprobación de la API Key porque ya se hace en el middleware
    if (!body.nombre) {
      throw new BadRequestException('Falta el campo nombre');
    }
    const productor = await this.productorsService.getOrCreate(body, apikey);
    const apikeyProductor = await this.apiKeysService.getOrCreate(productor);
    const response: ResponseCreateProducer = {
      apikey: apikeyProductor.key,
      nombre: productor.nombre,
    };
    return response;
  }

  public async getDepartamentos(): Promise<Departments> {
    const populate: IPopulate = {
      path: 'provincia',
      select: 'nombre',
    };
    const query = {
      limit: 0,
      select: 'nombre idProvincia',
      populate: JSON.stringify(populate),
    };
    const res = await this.departamentosService.get(query);
    const response: Departments = {
      data: res.datos.map((d) => {
        return {
          _id: d._id,
          nombre: d.nombre,
          provincia: d.provincia?.nombre || 'Sin Definir',
        };
      }),
    };
    return response;
  }

  public async getSemillas(cultivo: Cultivo): Promise<Seeds> {
    const filter: IFilter<ISemilla> = { cultivo };
    const query = {
      filter: JSON.stringify(filter),
      limit: 0,
      select: 'semillero cultivo variedad ciclo campania',
    };
    const res = await this.semillasService.get(query);
    const response: Seeds = {
      data: res.datos,
    };
    return response;
  }

  public async solicitarPrediccion(
    apikey: IApikey,
    body: RequestPrediction,
  ): Promise<SowingId> {
    const establecimiento = await this.getEstablecimiento(apikey, body);
    const lote = await this.getLote(body, establecimiento);
    const siembra = await this.createSiembra(body, lote);
    return { idSiembra: siembra._id };
  }

  public async consultarPrediccionRiego(
    apikey: IApikey,
    idSiembra: string,
    fecha?: string,
  ) {
    const prediccion = await this.prediccionRiegoService.getBySiembraYFecha(
      idSiembra,
      fecha,
    );
    const res: ResponseIrrigationPrediction = {
      idSiembra,
      lote: prediccion?.lote?.nombre || 'Sin lote',
      capacidadDeCampo: prediccion?.lote?.capacidadDeCampo || 0,
      puntoDeMarchitez: prediccion?.lote?.puntoMarchitez || 0,
      fecha: prediccion?.fechaPrediccion,
      recomendacion: prediccion?.regar,
    };
    return res;
  }

  public async consultarPrediccionEnfermedades(
    apikey: IApikey,
    idSiembra: string,
    fecha?: string,
  ) {
    const siembra = await this.siembrasService.getById(idSiembra, apikey);
    const prediccion = await this.prediccionsService.getBySiembraYFecha(
      idSiembra,
      fecha,
    );
    const res: ResponseDiseasePrediction = {
      idSiembra,
      lote: siembra?.lote?.nombre,
      cultivo: siembra?.semilla?.cultivo,
      fecha: prediccion?.fechaPrediccion,
      enfermedades: [],
    };
    for (const enfermedad of prediccion?.enfermedades || []) {
      res.enfermedades.push({
        enfermedad: enfermedad.enfermedad,
        resultado: enfermedad.resultado,
      });
    }
    return res;
  }

  // Private
  private async getEstablecimiento(apikey: IApikey, body: RequestPrediction) {
    const nombreEstablecimiento = body.establecimiento;
    if (!nombreEstablecimiento) {
      throw new Error('Falta el campo establecimiento');
    }
    return await this.establecimientosService.getOrCreateByNombre(
      nombreEstablecimiento,
      apikey,
    );
  }

  private async getLote(
    body: RequestPrediction,
    establecimiento: IEstablecimiento,
  ) {
    const nombreLote = body.lote;
    if (!nombreLote) {
      throw new Error('Falta el campo lote');
    }
    return await this.lotesService.getOrCreateByNombre(
      nombreLote,
      establecimiento,
      body,
    );
  }

  private async createSiembra(body: RequestPrediction, lote: ILote) {
    const create: ICreateSiembra = {
      activa: true,
      fechaSiembra: body.fechaSiembra,
      idSemilla: body.idSemilla,
      idDepartamento: lote.idDepartamento,
      idEstablecimiento: lote.idEstablecimiento,
      idLote: lote._id,
      idDistribuidor: lote.idDistribuidor,
      idProductor: lote.idProductor,
      idQuimica: lote.idQuimica,
    };
    return await this.siembrasService.create(create);
  }
}
