import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import {
  IProductor,
  IListado,
  IQueryParam,
  ICreateProductor,
  IUpdateProductor,
  IPermiso,
  IFilter,
  ILicencia,
  ICreateLicenciaPorEntidad,
  IUsuario,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { ProductorsRepository } from './repository';
import { DistribuidorsService } from '../distribuidor/service';
import { LicenciasService } from '../licencia/service';
import { LicenciaPorEntidadsService } from '../licenciaPorEntidad/service';
import { AdvisorScopeService } from '../../auxiliares/authorization/advisor-scope.service';
import { EstablecimientosRepository } from '../establecimiento/repository';
import { LotesRepository } from '../lote/repository';
import { TenantsRepository } from '../tenant/repository';

@Injectable()
export class ProductorsService {
  constructor(
    private repository: ProductorsRepository,
    private distribuidorsService: DistribuidorsService,
    private licencias: LicenciasService,
    private licenciasPorEntidad: LicenciaPorEntidadsService,
    private advisorScope: AdvisorScopeService,
    @Optional() private establecimientosRepository?: EstablecimientosRepository,
    @Optional() private lotesRepository?: LotesRepository,
    @Optional() private tenantsRepository?: TenantsRepository,
  ) {}

  async getById(id: string, permiso: IPermiso): Promise<IProductor> {
    const res = await this.repository.getById(id);
    if (!this.puedeVer(res, permiso)) {
      throw new Error('No tiene permiso para ver este productor');
    }
    return res;
  }

  async get(
    filtro: IQueryParam,
    permiso: IPermiso,
  ): Promise<IListado<IProductor>> {
    this.agregarFiltroPermiso(filtro, permiso);
    return await this.repository.get(filtro);
  }

  async create(
    data: ICreateProductor,
    permiso: IPermiso,
    licencia: ILicencia,
  ): Promise<IProductor> {
    this.normalizarYValidarDatosFiscales(data);
    delete (data as ICreateProductor & { idAsesorPropietario?: string })
      .idAsesorPropietario;
    delete data.idTenant;
    if (permiso.nivel === 'Admin') {
      if (data.idDistribuidor) {
        const distribuidor = await this.distribuidorsService.getById(
          data.idDistribuidor,
          permiso,
        );
        data.idQuimica = distribuidor.idQuimica;
      }
      return await this.createAdmin(data);
    }

    if (permiso.nivel === 'Tenant') {
      await this.validarAltaProductorTenant(permiso);
      data.idTenant = permiso.idTenant;
      delete data.idDistribuidor;
      delete data.idQuimica;
      return await this.repository.create(data);
    }

    if (permiso.nivel === 'Asesor') {
      if (!permiso.idAsesor) {
        throw new BadRequestException(
          'No se pudo identificar al asesor propietario del productor',
        );
      }
      if (permiso.idTenant) {
        await this.validarAltaProductorTenant(permiso);
      }
      if (!licencia && !permiso.idTenant) {
        throw new BadRequestException(
          'El asesor debe tener una licencia efectiva para crear productores',
        );
      }
      data.idTenant = permiso.idTenant;
      data.idDistribuidor = permiso.idTenant
        ? undefined
        : permiso.idDistribuidor;
      data.idQuimica = permiso.idTenant ? undefined : permiso.idQuimica;
      (
        data as ICreateProductor & { idAsesorPropietario?: string }
      ).idAsesorPropietario = String(permiso.idAsesor);
      const productor = await this.repository.create(data);
      this.advisorScope.registerOwnedProducer(permiso, String(productor._id));
      return productor;
    }

    if (!data.idDistribuidor) {
      data.idDistribuidor = permiso.idDistribuidor;
    }
    const distribuidor = await this.distribuidorsService.getById(
      data.idDistribuidor,
      permiso,
    );
    data.idQuimica = distribuidor.idQuimica;
    // Licencias
    if (false) {
      return await this.createAdmin(data);
    } else {
      // Creados pro química y distribuidor
      // Hereda las licencias del distribuidor o química
      if (!licencia) {
        // Debería tener licencia
        throw new BadRequestException(
          'La química o distribuidor debe tener una licencia para poder crear un productor',
        );
      }

      // El productor hereda el plan de su distribuidor/compania. Una
      // asignacion directa solo se crea cuando el administrador la elige.
      return await this.repository.create(data);
    }
  }

  private async createAdmin(data: ICreateProductor): Promise<IProductor> {
    const idLicencia = (data.licencia as any)?._id as string | undefined;
    const expiracion = data.expiracion;
    const licencia = idLicencia
      ? await this.licencias.getById(idLicencia)
      : undefined;
    if (idLicencia && !licencia?._id)
      throw new BadRequestException('No se encontro el plan seleccionado');
    delete data.licencia;
    delete data.expiracion;
    const productor = await this.repository.create(data);
    // Sin plan explicito no se fabrica una asignacion directa: el productor
    // hereda de la red. Se conserva el camino legacy cuando un cliente antiguo
    // envia deliberadamente una licencia.
    if (!idLicencia) return productor;

    const fechaExpiracion = new Date();
    fechaExpiracion.setDate(fechaExpiracion.getDate() + (expiracion || 30));
    // Creo la licencia por entidad
    const createLicenciaPorEntidad: ICreateLicenciaPorEntidad = {
      idEntidad: productor._id,
      idLicencia: licencia._id,
      fechaExpiracion: fechaExpiracion.toISOString(),
      fechaInicio: new Date().toISOString(),
      tipoEntidad: 'Productor',
      estado: 'activa',
      origen: 'manual',
      motivoCambio: 'Plan seleccionado en el alta desde un cliente legacy',
    };
    await this.licenciasPorEntidad.create(createLicenciaPorEntidad);
    return productor;
  }

  async createInternal(data: ICreateProductor): Promise<IProductor> {
    return await this.repository.create(data);
  }

  async update(
    id: string,
    data: IUpdateProductor,
    permiso: IPermiso,
  ): Promise<IProductor> {
    this.normalizarYValidarDatosFiscales(data);
    delete (data as IUpdateProductor & { idAsesorPropietario?: string })
      .idAsesorPropietario;
    delete data.idTenant;
    await this.getById(id, permiso);
    if (permiso.nivel === 'Asesor') {
      delete data.idDistribuidor;
      delete data.idQuimica;
    } else if (permiso.nivel === 'Tenant') {
      delete data.idDistribuidor;
      delete data.idQuimica;
    } else if (!this.puedeVer(data, permiso)) {
      throw new Error('No tiene permiso para actualizar este productor');
    }
    if (permiso.nivel === 'Admin') {
      return await this.updateAdmin(id, data);
    }
    delete data.licencia;
    delete data.expiracion;
    return await this.repository.update(id, data);
  }

  private async updateAdmin(
    id: string,
    data: IUpdateProductor,
  ): Promise<IProductor> {
    if (!data.licencia) {
      // En update no es obligatorio enviar la licencia, ya que podés updatear la entidad sin cambiar la licencia.
      return await this.repository.update(id, data);
    }
    const idLicencia = (data.licencia as any)?._id as string | undefined;
    if (!idLicencia) {
      throw new BadRequestException(
        'Seleccione un plan existente; los planes se crean desde Gestion de licencias',
      );
    }
    const fechaExpiracion = new Date();
    fechaExpiracion.setDate(
      fechaExpiracion.getDate() + (data.expiracion || 30),
    );
    await this.licenciasPorEntidad.asignar(id, {
      idLicencia,
      tipoEntidad: 'Productor',
      fechaInicio: new Date().toISOString(),
      fechaExpiracion: fechaExpiracion.toISOString(),
      motivoCambio: 'Cambio desde la administracion del productor',
    });
    delete data.licencia;
    delete data.expiracion;
    return await this.repository.update(id, data);
  }

  async delete(
    id: string,
    permiso: IPermiso,
    actor?: IUsuario,
  ): Promise<IProductor> {
    await this.getById(id, permiso);
    const audit = {
      archivadoPor: actor?.username || actor?._id || 'sistema',
      motivoArchivado: 'Productor archivado desde Chaman',
    };
    const [establecimientos, lotes] = await Promise.all([
      this.establecimientosRepository?.get({
        page: 0,
        limit: 0,
        filter: JSON.stringify({ idProductor: id }),
        select: '_id',
      }),
      this.lotesRepository?.get({
        page: 0,
        limit: 0,
        filter: JSON.stringify({ idProductor: id }),
        select: '_id',
      }),
    ]);
    await Promise.all(
      (lotes?.datos || []).map((item) =>
        this.lotesRepository!.delete(String(item._id), audit),
      ),
    );
    await Promise.all(
      (establecimientos?.datos || []).map((item) =>
        this.establecimientosRepository!.delete(String(item._id), audit),
      ),
    );
    const deleted = await this.repository.delete(id, audit);
    if (permiso.nivel === 'Asesor') {
      this.advisorScope.removeOwnedProducer(permiso, id);
    }
    return deleted;
  }

  // Private

  private normalizarYValidarDatosFiscales(
    data: ICreateProductor | IUpdateProductor,
  ): void {
    const limpiar = (valor?: string): string | undefined => {
      const texto = String(valor || '').trim();
      return texto || undefined;
    };
    data.razonSocial = limpiar(data.razonSocial);
    data.condicionIva = limpiar(data.condicionIva);
    data.emailFiscal = limpiar(data.emailFiscal)?.toLowerCase();
    data.telefonoFiscal = limpiar(data.telefonoFiscal);
    data.direccionFiscal = limpiar(data.direccionFiscal);

    const cuit = String(data.cuit || '').replace(/\D/g, '');
    data.cuit = cuit || undefined;
    if (cuit && !this.cuitValido(cuit)) {
      throw new BadRequestException(
        'El CUIT del productor debe tener 11 dígitos y un dígito verificador válido',
      );
    }
  }

  private cuitValido(cuit: string): boolean {
    if (!/^\d{11}$/.test(cuit)) return false;
    const multiplicadores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const suma = multiplicadores.reduce(
      (total, multiplicador, indice) =>
        total + Number(cuit[indice]) * multiplicador,
      0,
    );
    let verificador = 11 - (suma % 11);
    if (verificador === 11) verificador = 0;
    if (verificador === 10) verificador = 9;
    return verificador === Number(cuit[10]);
  }

  private puedeVer(data: IProductor, permiso: IPermiso): boolean {
    if (permiso.nivel === 'Admin') {
      return true;
    }
    if (permiso.nivel === 'Tenant') {
      return (
        !!permiso.idTenant &&
        String(data.idTenant || '') === String(permiso.idTenant)
      );
    }
    if (permiso.nivel === 'Quimica') {
      return !data.idQuimica || data.idQuimica === permiso.idQuimica;
    }
    if (permiso.nivel === 'Distribuidor') {
      return (
        !data.idDistribuidor || data.idDistribuidor === permiso.idDistribuidor
      );
    }
    if (permiso.nivel === 'Asesor') {
      return (
        String(data.idAsesorPropietario || '') ===
        String(permiso.idAsesor || '')
      );
    }
    if (permiso.nivel === 'Productor') {
      return !data._id || data._id === permiso.idProductor;
    }
    return false;
  }

  private agregarFiltroPermiso(query: IQueryParam, permiso: IPermiso) {
    const filtro: IFilter<IProductor> = HelperService.filtroToObject(
      query.filter,
    );
    const $and = filtro.$and || [];

    if (permiso.nivel === 'Tenant') {
      $and.push({ idTenant: permiso.idTenant });
    }

    if (permiso.nivel === 'Quimica') {
      $and.push({ idQuimica: permiso.idQuimica });
    }
    if (permiso.nivel === 'Distribuidor') {
      $and.push({ idDistribuidor: permiso.idDistribuidor });
    }
    if (permiso.nivel === 'Asesor') {
      $and.push({ idAsesorPropietario: permiso.idAsesor });
    }
    if (permiso.nivel === 'Productor') {
      $and.push({ _id: permiso.idProductor });
    }

    if ($and.length > 0) {
      filtro.$and = $and;
      query.filter = JSON.stringify(filtro);
    }
  }

  private async validarAltaProductorTenant(permiso: IPermiso): Promise<void> {
    if (!permiso.idTenant || !this.tenantsRepository) {
      throw new ForbiddenException('La sesion no tiene un tenant operativo');
    }
    const tenant = await this.tenantsRepository.getById(permiso.idTenant);
    if (
      !tenant?._id ||
      tenant.estado !== 'activo' ||
      tenant.archivado ||
      tenant.capacidades?.administrarProductores !== true
    ) {
      throw new ForbiddenException(
        'El tenant no tiene habilitada la administracion de productores',
      );
    }
    const limite = Number(tenant.limites?.productores || 0);
    if (limite > 0) {
      const actuales = await this.repository.get({
        page: 0,
        limit: 1,
        select: '_id',
        filter: JSON.stringify({
          idTenant: permiso.idTenant,
          archivado: { $ne: true },
        }),
      });
      if (actuales.totalCount >= limite) {
        throw new BadRequestException(
          `El tenant alcanzo el limite de ${limite} productores`,
        );
      }
    }
  }
}
