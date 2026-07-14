import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  aplicarEntradasAgronomicasSuelo,
  ICreateSiembra,
  IQueryParam,
  IUpdateLote,
  IUpdateSiembra,
} from 'modelos/src';
import { AlgoritmosService } from '../algoritmos/service';
import { FertilizacionsService } from '../fertilizacion/service';
import { FumigacionsService } from '../fumigacion/service';
import { LotesService } from '../lote/service';
import { SoilAgronomicInputsService } from '../suelo-inteligencia/agronomic-inputs.service';
import { SiembrasRepository } from './repository';

@Injectable()
export class SiembrasService {
  private readonly logger = new Logger(SiembrasService.name);

  constructor(
    private repository: SiembrasRepository,
    private lotesService: LotesService,
    private fertilizacionsService: FertilizacionsService,
    private fumigacionsService: FumigacionsService,
    private algoritmosService: AlgoritmosService,
    private soilInputsService: SoilAgronomicInputsService,
  ) {}

  async getFilter(query: IQueryParam) {
    return await this.repository.getFilter(query);
  }

  async getById(id: string) {
    const data = await this.repository.getById(id);
    if (data) {
      return data;
    }
    throw new NotFoundException('No encontrado');
  }

  async create(dato: ICreateSiembra) {
    return await this.repository.create(dato);
  }

  async update(id: string, dato: IUpdateSiembra) {
    const updated = await this.repository.update(id, dato);
    if (updated) {
      return updated;
    }
    throw new NotFoundException('No encontrado');
  }

  async delete(id: string) {
    const deleted = await this.repository.delete(id);
    if (deleted) {
      return deleted;
    }
    throw new NotFoundException('No encontrado');
  }

  async cosechar(id: string, dato: IUpdateSiembra) {
    const siembra = await this.getById(id);
    const lotePersistido = await this.lotesService.getById(siembra.idLote);
    const lote = await this.withCanonicalSoil(lotePersistido);

    const rendimientoSeco = this.algoritmosService.calcularHumedadSeca(
      dato.rendimientoObtenidoKgHa,
      dato.humedadCosecha,
    );

    const siembraParaCalculo = {
      ...siembra,
      ...dato,
      fechaCosecha: dato.fechaCosecha,
      rendimientoObtenidoKgHaSeco: rendimientoSeco,
      activa: false,
    };

    const desdeFertilizacion = new Date(siembra.fechaSiembra);
    desdeFertilizacion.setDate(desdeFertilizacion.getDate() - 30);
    const hasta = new Date(dato.fechaCosecha).toISOString();

    const [fertilizaciones, fumigaciones] = await Promise.all([
      this.fertilizacionsService.getFilter({
        filter: JSON.stringify({
          idLote: siembra.idLote,
          fechaFertilizacion: { $gte: desdeFertilizacion.toISOString(), $lte: hasta },
        }),
        populate: 'fertilizante',
      }),
      this.fumigacionsService.getFilter({
        filter: JSON.stringify({ idSiembra: id }),
        populate: 'principioActivo',
      }),
    ]);

    const resultado = await this.algoritmosService.calcularHuellaHidricaReal({
      siembra: siembraParaCalculo,
      lote,
      fertilizaciones: fertilizaciones.datos,
      fumigaciones: fumigaciones.datos,
    });

    const updateSiembra: IUpdateSiembra = {
      ...dato,
      rendimientoObtenidoKgHaSeco: rendimientoSeco,
      activa: false,
      huellaHidrica: resultado.huella,
    };

    const loteUpdate: IUpdateLote = { huellaHidrica: resultado.huella };
    if (lotePersistido.suelos?.length) {
      loteUpdate.suelos = lotePersistido.suelos.map((suelo) => ({
        ...suelo,
        hayRaices: false,
      }));
    }

    const [updated] = await Promise.all([
      this.repository.update(id, updateSiembra),
      this.lotesService.update(lote._id, loteUpdate),
    ]);

    if (updated) {
      return updated;
    }
    throw new NotFoundException('No encontrado');
  }

  async seguimientoHuellaHidrica(id: string) {
    const siembra = await this.getById(id);
    const lote = await this.withCanonicalSoil(
      await this.lotesService.getById(siembra.idLote),
    );
    const fechaSiembra = siembra.fechaSiembra ? new Date(siembra.fechaSiembra) : new Date();
    fechaSiembra.setDate(fechaSiembra.getDate() - 30);
    const hasta = (siembra.fechaCosecha ? new Date(siembra.fechaCosecha) : new Date()).toISOString();

    const [fertilizaciones, fumigaciones] = await Promise.all([
      this.fertilizacionsService.getFilter({
        filter: JSON.stringify({
          idLote: siembra.idLote,
          fechaFertilizacion: { $gte: fechaSiembra.toISOString(), $lte: hasta },
        }),
        populate: 'fertilizante',
      }),
      this.fumigacionsService.getFilter({
        filter: JSON.stringify({ idSiembra: id }),
        populate: 'principioActivo',
      }),
    ]);

    return await this.algoritmosService.calcularSeguimientoHuellaHidrica({
      siembra,
      lote,
      fertilizaciones: fertilizaciones.datos,
      fumigaciones: fumigaciones.datos,
    });
  }

  private async withCanonicalSoil(lote: any) {
    try {
      const inputs = await this.soilInputsService.getForLot(`${lote._id}`);
      return aplicarEntradasAgronomicasSuelo(lote, inputs);
    } catch (error) {
      this.logger.warn(
        `Entradas edaficas canonicas no disponibles para huella del lote ${lote?._id || ''}; se conserva el perfil previo: ${error?.message || error}`,
      );
      return aplicarEntradasAgronomicasSuelo(lote, null);
    }
  }

  async prediccionMalezas(id: string) {
    const siembra = await this.getById(id);
    const lote = await this.lotesService.getById(siembra.idLote);
    const resultado = await this.algoritmosService.calcularPrediccionMalezas({ siembra, lote });

    if (resultado.estado !== 'sin_clima') {
      await this.repository.update(id, { ultimaPrediccionMalezas: resultado });
    }

    return resultado;
  }
}
