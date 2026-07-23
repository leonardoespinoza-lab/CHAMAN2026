import { Injectable } from '@nestjs/common';
import {
  ILicencia,
  IMetricaUsoLicencia,
  IPermiso,
  IUsoLicenciaEntidad,
  TipoEntidadLicencia,
} from 'modelos/src';
import { DistribuidorsRepository } from '../distribuidor/repository';
import { EstablecimientosRepository } from '../establecimiento/repository';
import { LotesRepository } from '../lote/repository';
import { ProductorsRepository } from '../productor/repository';
import { UsuariosRepository } from '../usuario/repository';

@Injectable()
export class LicenseUsageService {
  constructor(
    private usuarios: UsuariosRepository,
    private distribuidores: DistribuidorsRepository,
    private productores: ProductorsRepository,
    private establecimientos: EstablecimientosRepository,
    private lotes: LotesRepository,
  ) {}

  async medir(
    tipoEntidad: TipoEntidadLicencia,
    idEntidad: string,
    licencia: ILicencia,
  ): Promise<IUsoLicenciaEntidad> {
    const filtros = this.filtrosPorEntidad(tipoEntidad, idEntidad);
    const [usuarios, distribuidores, productores, establecimientos, lotes] =
      await Promise.all([
        this.usuarios.get({
          page: 0,
          limit: 0,
          select: '_id permisos creadoPorUsuario',
        }),
        this.contar(this.distribuidores, filtros.distribuidores),
        this.contar(this.productores, filtros.productores),
        this.contar(this.establecimientos, filtros.establecimientos),
        this.listarLotes(filtros.lotes),
      ]);

    const usuariosActuales = (usuarios.datos || []).filter(
      (usuario) =>
        (usuario.permisos || []).some((permiso) =>
          this.permisoCoincide(permiso, tipoEntidad, idEntidad),
        ) ||
        (tipoEntidad === 'Asesor' &&
          String(usuario.creadoPorUsuario || '') === idEntidad),
    ).length;
    const hectareas = this.redondear(
      lotes.reduce(
        (total, lote) => total + this.superficie(lote.ubicacion?.superficie),
        0,
      ),
    );

    return {
      medidoEn: new Date().toISOString(),
      usuarios: this.metrica(usuariosActuales, licencia.maxUsuarios),
      distribuidores: this.metrica(
        distribuidores,
        licencia.maxDistribuidores ?? licencia.maxdDistribuidores,
      ),
      productores: this.metrica(productores, licencia.maxProductores),
      establecimientos: this.metrica(
        establecimientos,
        licencia.maxEstablecimientos,
      ),
      lotes: this.metrica(lotes.length, licencia.maxLotes),
      hectareas: this.metrica(
        hectareas,
        licencia.maxHectareas ?? licencia.maxdHectareas,
      ),
    };
  }

  private filtrosPorEntidad(
    tipo: TipoEntidadLicencia,
    id: string,
  ): {
    distribuidores?: Record<string, string>;
    productores?: Record<string, string>;
    establecimientos?: Record<string, string>;
    lotes?: Record<string, string>;
  } {
    if (tipo === 'Quimica') {
      return {
        distribuidores: { idQuimica: id },
        productores: { idQuimica: id },
        establecimientos: { idQuimica: id },
        lotes: { idQuimica: id },
      };
    }
    if (tipo === 'Distribuidor') {
      return {
        productores: { idDistribuidor: id },
        establecimientos: { idDistribuidor: id },
        lotes: { idDistribuidor: id },
      };
    }
    if (tipo === 'Productor') {
      return {
        establecimientos: { idProductor: id },
        lotes: { idProductor: id },
      };
    }
    if (tipo === 'Establecimiento') return { lotes: { idEstablecimiento: id } };
    return {
      productores: { idAsesorPropietario: id },
      establecimientos: { idAsesorPropietario: id },
      lotes: { idAsesorPropietario: id },
    };
  }

  private async contar(
    repository: {
      get: (params: any) => Promise<{ totalCount: number; datos: unknown[] }>;
    },
    filtro?: Record<string, string>,
  ): Promise<number> {
    if (!filtro) return 0;
    const resultado = await repository.get({
      page: 0,
      limit: 1,
      filter: JSON.stringify(filtro),
      select: '_id',
    });
    return resultado.totalCount ?? resultado.datos?.length ?? 0;
  }

  private async listarLotes(filtro?: Record<string, string>) {
    if (!filtro) return [];
    const resultado = await this.lotes.get({
      page: 0,
      limit: 0,
      filter: JSON.stringify(filtro),
      select: '_id ubicacion.superficie',
    });
    return resultado.datos || [];
  }

  private permisoCoincide(
    permiso: IPermiso,
    tipo: TipoEntidadLicencia,
    id: string,
  ): boolean {
    if (tipo === 'Quimica') return String(permiso.idQuimica || '') === id;
    if (tipo === 'Distribuidor')
      return String(permiso.idDistribuidor || '') === id;
    if (tipo === 'Productor') return String(permiso.idProductor || '') === id;
    if (tipo === 'Establecimiento') {
      return (
        String(permiso.idEstablecimiento || '') === id ||
        (permiso.idEstablecimientos || []).map(String).includes(id)
      );
    }
    return String(permiso.idAsesor || '') === id;
  }

  private metrica(actual: number, limite?: number): IMetricaUsoLicencia {
    const porcentaje =
      limite && limite > 0
        ? this.redondear((actual / limite) * 100)
        : undefined;
    return {
      actual: this.redondear(actual),
      limite,
      porcentaje,
      excedido: limite !== undefined && actual > limite,
    };
  }

  private superficie(valor: unknown): number {
    const numero = Number(valor);
    return Number.isFinite(numero) && numero > 0 ? numero : 0;
  }

  private redondear(valor: number): number {
    return Math.round((valor + Number.EPSILON) * 100) / 100;
  }
}
