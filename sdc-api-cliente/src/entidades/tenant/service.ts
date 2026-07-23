import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  ICreateTenant,
  IAdministradorInicialTenant,
  IPermiso,
  IQueryParam,
  ITenant,
  IUpdateTenant,
  IUsuario,
} from 'modelos/src';
import { UsuariosService } from '../usuario/service';
import { TenantsRepository } from './repository';

@Injectable()
export class TenantsService {
  private readonly passwordPolicyMessage =
    'La contrasena debe tener al menos 8 caracteres, incluir mayuscula, minuscula y numero, sin espacios.';

  constructor(
    private readonly repository: TenantsRepository,
    private readonly usuarios: UsuariosService,
  ) {}

  get(query: IQueryParam) {
    return this.repository.get(query);
  }

  async getById(id: string, permiso: IPermiso): Promise<ITenant> {
    this.assertOwnTenant(id, permiso);
    return this.repository.getById(id);
  }

  async getCurrent(permiso: IPermiso): Promise<ITenant> {
    if (!permiso.idTenant) {
      throw new BadRequestException('La sesion no tiene un tenant activo');
    }
    return this.repository.getById(permiso.idTenant);
  }

  async create(
    data: ICreateTenant,
    permiso: IPermiso,
    actor: IUsuario,
  ): Promise<ITenant> {
    const admin = data.administrador;
    this.validateAdmin(admin);

    const slug = this.slug(data.slug || data.nombre || '');
    const existente = await this.getBySlugIfExists(slug);
    let tenant: ITenant;

    if (existente) {
      const esBorradorPropio =
        !existente.provisionado &&
        existente.estado !== 'archivado' &&
        !existente.archivado &&
        String(existente.creadoPorUsuario || '') === String(actor?._id || '');
      if (!esBorradorPropio) {
        throw new BadRequestException('Ya existe un tenant con ese slug');
      }

      const { administrador: _administrador, ...configuracion } = data;
      tenant = await this.repository.update(existente._id!, {
        ...configuracion,
        slug,
        estado: data.estado || 'activo',
      });
    } else {
      tenant = await this.repository.create({
        ...data,
        slug,
        administrador: undefined,
        estado: data.estado || 'activo',
        creadoPorUsuario: actor?._id,
        provisionado: false,
      } as any);
    }
    return this.provisionar(tenant._id!, admin, permiso, actor);
  }

  async provisionar(
    id: string,
    admin: IAdministradorInicialTenant,
    permiso: IPermiso,
    actor: IUsuario,
  ): Promise<ITenant> {
    if (permiso.nivel !== 'Admin') {
      throw new ForbiddenException('Solo CHAMAN Admin puede provisionar tenants');
    }
    this.validateAdmin(admin);
    const tenant = await this.repository.getById(id);
    if (tenant.provisionado && tenant.idUsuarioAdmin) {
      throw new BadRequestException('El tenant ya tiene administrador');
    }
    try {
      const usuario = await this.usuarios.create(
        {
          username: admin.username,
          password: admin.password,
          activo: true,
          email: admin.email,
          datosPersonales: { nombre: admin.nombre, email: admin.email },
          permisos: [
            {
              nivel: 'Tenant',
              rol: 'Admin',
              idTenant: tenant._id,
              modulos: tenant.modulos,
            },
          ],
        },
        permiso,
        actor,
      );
      return await this.repository.update(tenant._id!, {
        idUsuarioAdmin: usuario._id,
        provisionado: true,
        ultimoErrorProvisionamiento: '',
        estado: tenant.estado === 'borrador' ? 'activo' : tenant.estado,
      });
    } catch (error: any) {
      await this.repository.update(tenant._id!, {
        estado: 'borrador',
        provisionado: false,
        ultimoErrorProvisionamiento:
          error?.response?.data?.message ||
          error?.message ||
          'No se pudo crear el administrador inicial',
      });
      throw error;
    }
  }

  async update(
    id: string,
    data: IUpdateTenant,
    permiso: IPermiso,
  ): Promise<ITenant> {
    this.assertOwnTenant(id, permiso);
    if (permiso.nivel === 'Tenant') {
      const permitidos: IUpdateTenant = {
        branding: data.branding,
        dominios: data.dominios,
      };
      return this.repository.update(id, permitidos);
    }
    return this.repository.update(id, data);
  }

  archive(id: string, actor: IUsuario) {
    return this.repository.archive(id, {
      archivadoPor: actor?.username || actor?._id || 'sistema',
      motivoArchivado: 'Tenant archivado desde Chaman Admin',
    });
  }

  private assertOwnTenant(id: string, permiso: IPermiso): void {
    if (permiso.nivel === 'Admin') return;
    if (
      permiso.nivel !== 'Tenant' ||
      !permiso.idTenant ||
      String(permiso.idTenant) !== String(id)
    ) {
      throw new ForbiddenException('El tenant solicitado queda fuera del alcance');
    }
  }

  private validateAdmin(admin?: IAdministradorInicialTenant): void {
    if (!admin?.username?.trim() || !admin.nombre?.trim()) {
      throw new BadRequestException(
        'Indique nombre, usuario y contrasena del administrador',
      );
    }
    const password = String(admin.password || '');
    if (
      password.length < 8 ||
      /\s/.test(password) ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/\d/.test(password)
    ) {
      throw new BadRequestException(this.passwordPolicyMessage);
    }
  }

  private slug(value: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 63);
  }

  private async getBySlugIfExists(slug: string): Promise<ITenant | undefined> {
    try {
      return await this.repository.getBySlug(slug);
    } catch (error: any) {
      const status = Number(error?.status || error?.getStatus?.() || 0);
      if (status === 404) return undefined;
      throw error;
    }
  }
}
