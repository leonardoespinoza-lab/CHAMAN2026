import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ILicencia,
  IListado,
  IQueryParam,
  ICreateLicencia,
  IUpdateLicencia,
  IUsuario,
} from 'modelos/src';
import { LicenciasRepository } from './repository';
import { LicenciaPorEntidadsRepository } from '../licenciaPorEntidad/repository';

@Injectable()
export class LicenciasService {
  constructor(
    private repository: LicenciasRepository,
    private asignaciones: LicenciaPorEntidadsRepository,
  ) {}

  async getById(id: string): Promise<ILicencia> {
    return this.normalizar(await this.repository.getById(id));
  }

  async get(filtro: IQueryParam, user: IUsuario): Promise<IListado<ILicencia>> {
    void user;
    return this.normalizarListado(await this.repository.get(filtro));
  }

  async getInternal(filtro: IQueryParam): Promise<IListado<ILicencia>> {
    return this.normalizarListado(await this.repository.get(filtro));
  }

  async create(data: ICreateLicencia): Promise<ILicencia> {
    if (!data.nombre?.trim())
      throw new BadRequestException('El nombre del plan es obligatorio');
    data.origen = data.origen || 'manual';
    data.fechaCreacion = data.fechaCreacion || new Date().toISOString();
    data.codigo = this.normalizarCodigo(data.codigo || data.nombre);
    data.version = data.version || 1;
    await this.validarCodigoVersionDisponible(data.codigo, data.version);
    data.estado = data.estado || 'activo';
    data.modeloFacturacion = data.modeloFacturacion || 'sin_cargo';
    data.modoLimite = data.modoLimite || 'informativo';
    if (data.default) {
      const existente = await this.repository.get({
        page: 0,
        limit: 1,
        filter: JSON.stringify({ default: true }),
      });
      if (existente.totalCount > 0) {
        throw new BadRequestException(
          'Ya existe un plan por defecto; desmarquelo antes de crear otro',
        );
      }
    }
    this.normalizarLimites(data);
    return this.normalizar(await this.repository.create(data));
  }

  async update(id: string, data: IUpdateLicencia): Promise<ILicencia> {
    const actual = await this.getById(id);
    if (data.codigo) data.codigo = this.normalizarCodigo(data.codigo);
    const codigo = data.codigo || actual.codigo;
    const version = data.version || actual.version || 1;
    if (codigo) await this.validarCodigoVersionDisponible(codigo, version, id);
    if (actual.default && data.estado === 'archivado') {
      throw new BadRequestException(
        'El plan por defecto no puede archivarse hasta definir otro plan por defecto',
      );
    }
    this.normalizarLimites(data);
    return this.normalizar(await this.repository.update(id, data));
  }

  async delete(id: string): Promise<ILicencia> {
    const asignadas = await this.asignaciones.get({
      page: 0,
      limit: 1,
      filter: JSON.stringify({ idLicencia: id }),
    });
    if (asignadas.totalCount > 0) {
      throw new BadRequestException(
        'El plan tiene asignaciones historicas y no puede eliminarse; archivelo para conservar la trazabilidad',
      );
    }
    return await this.repository.delete(id);
  }

  private normalizarCodigo(valor: string): string {
    return valor
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60);
  }

  private async validarCodigoVersionDisponible(
    codigo: string,
    version: number,
    excluirId?: string,
  ): Promise<void> {
    const existentes = await this.repository.get({
      page: 0,
      limit: 2,
      filter: JSON.stringify({ codigo, version }),
      select: '_id codigo version',
    });
    if (
      (existentes.datos || []).some(
        (item) => !excluirId || String(item._id) !== String(excluirId),
      )
    ) {
      throw new BadRequestException(
        `Ya existe el plan ${codigo} version ${version}`,
      );
    }
  }

  private normalizarLimites(data: Partial<ILicencia>): void {
    data.maxDistribuidores = data.maxDistribuidores ?? data.maxdDistribuidores;
    data.maxHectareas = data.maxHectareas ?? data.maxdHectareas;
    // Se conservan los alias durante la transicion porque existen clientes
    // desplegados que aun leen los nombres historicos.
    data.maxdDistribuidores = data.maxDistribuidores;
    data.maxdHectareas = data.maxHectareas;
  }

  private normalizar(licencia: ILicencia): ILicencia {
    if (!licencia) return licencia;
    this.normalizarLimites(licencia);
    return licencia;
  }

  private normalizarListado(listado: IListado<ILicencia>): IListado<ILicencia> {
    return {
      ...listado,
      datos: (listado?.datos || []).map((licencia) =>
        this.normalizar(licencia),
      ),
    };
  }
}
