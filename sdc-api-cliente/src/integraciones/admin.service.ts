import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  ApiClientRecord,
  ApiSettings,
  apiClientView,
  apiId,
  apiObjectId,
  IPermiso,
  IUsuario,
  validApiSettings,
  API_SERVICES,
} from 'modelos/src';
import {
  IntegrationControlStore,
  integrationEnvironment,
} from './control-store';
import { UsuariosRepository } from '../entidades/usuario/repository';
import { hash } from './contract';

@Injectable()
export class IntegrationAdminService {
  constructor(
    private readonly store: IntegrationControlStore,
    private readonly users: UsuariosRepository,
  ) {}
  assertAdmin(permission: IPermiso, actor: IUsuario) {
    if (
      permission?.nivel !== 'Admin' ||
      permission?.rol !== 'Admin' ||
      !apiObjectId(actor?._id)
    )
      throw new ForbiddenException(
        'Sólo el administrador general puede gestionar integraciones.',
      );
  }
  async list() {
    const data = await this.store.command<{
      items: ApiClientRecord[];
      truncated: boolean;
    }>({ action: 'list' });
    const environment = integrationEnvironment();
    return {
      items: data.items.map(apiClientView),
      truncated: data.truncated,
      environment,
      services: API_SERVICES,
      apiEnabled:
        process.env.CHAMAN_INTEGRATIONS_ENABLED === 'true' &&
        (environment !== 'production' ||
          process.env.CHAMAN_INTEGRATIONS_PRODUCTION_ENABLED === 'true'),
      registrySource:
        process.env.CHAMAN_INTEGRATIONS_REGISTRY_SOURCE || 'environment',
      baseUrl:
        environment === 'production'
          ? 'https://chaman-api-production.up.railway.app/sdc-quimica/integraciones/v1'
          : 'https://testing-api-testing.up.railway.app/sdc-quimica-test/integraciones/v1',
    };
  }
  async operator(username: unknown) {
    if (
      typeof username !== 'string' ||
      !/^[A-Za-z0-9_.@-]{2,100}$/.test(username)
    )
      throw new BadRequestException('Ingresá el usuario exacto del asesor.');
    const user = await this.users.getByUsername(username);
    const permissions = (user?.permisos || [])
      .map((p, index) => ({ index, rol: p.rol, nivel: p.nivel }))
      .filter(
        (p) =>
          p.nivel === 'Asesor' &&
          ['Admin', 'Escritura', 'Lectura'].includes(p.rol),
      );
    if (!user || user.archivado || user.activo !== true || !permissions.length)
      throw new BadRequestException('Se requiere un asesor activo.');
    return { id: user._id, username: user.username, permissions };
  }
  private async validateOperator(
    id: string,
    index: number,
    settings: ApiSettings,
  ) {
    const user = await this.users.getById(id);
    const permission = user?.permisos?.[index];
    if (
      !user ||
      user.archivado ||
      user.activo !== true ||
      permission?.nivel !== 'Asesor' ||
      !['Admin', 'Escritura', 'Lectura'].includes(permission.rol)
    )
      throw new BadRequestException(
        'La cuenta operadora debe ser un asesor activo.',
      );
    if (
      settings.scopes.includes('estructura:crear') &&
      permission.rol === 'Lectura'
    )
      throw new BadRequestException(
        'Este asesor sólo tiene permisos de lectura.',
      );
    if (
      settings.scopes.includes('fenologia:leer') &&
      permission.modulos?.EtapasFenologicas === false
    )
      throw new BadRequestException('La cuenta no tiene Fenología habilitada.');
  }
  async create(data: any, actorId: string) {
    if (!validApiSettings(data, true) || data.enabled !== false)
      throw new BadRequestException(
        'Completá la configuración. Las altas se guardan deshabilitadas.',
      );
    await this.validateOperator(data.advisorUserId, data.permissionIndex, data);
    return apiClientView(
      await this.store.command({
        action: 'create',
        id: data.id,
        data,
        actorId,
      }),
    );
  }
  async get(id: string): Promise<ApiClientRecord> {
    if (!apiId(id)) throw new BadRequestException('Identificador inválido.');
    return this.store.command({ action: 'get', id });
  }
  async update(id: string, body: any, actorId: string) {
    if (
      !body ||
      Object.keys(body).length !== 2 ||
      !validApiSettings(body.settings) ||
      !Number.isInteger(body.revision)
    )
      throw new BadRequestException('Configuración inválida.');
    const current = await this.get(id);
    if (body.settings.enabled)
      await this.validateOperator(
        current.advisorUserId,
        current.permissionIndex,
        body.settings,
      );
    return apiClientView(
      await this.store.command({
        action: 'update',
        id,
        data: body.settings,
        revision: body.revision,
        actorId,
      }),
    );
  }
  async issueKey(id: string, revision: number, actorId: string) {
    if (!Number.isInteger(revision))
      throw new BadRequestException('Revisión inválida.');
    const current = await this.get(id);
    const keyId = randomBytes(12).toString('hex');
    const credential = `chm_${current.environment === 'production' ? 'live' : 'test'}_${keyId}.${randomBytes(32).toString('base64url')}`;
    const saved = await this.store.command<ApiClientRecord>({
      action: 'issue-key',
      id,
      revision,
      actorId,
      key: {
        id: keyId,
        sha256: hash(credential),
        expiresAt: current.expiresAt,
      },
    });
    // Only this response contains the secret. It is never persisted or included in documentation.
    return { client: apiClientView(saved), credential };
  }
  async revokeKey(
    id: string,
    keyId: string,
    revision: number,
    actorId: string,
  ) {
    if (!apiId(id) || !apiId(keyId) || !Number.isInteger(revision))
      throw new BadRequestException('Clave inválida.');
    return apiClientView(
      await this.store.command({
        action: 'revoke-key',
        id,
        keyId,
        revision,
        actorId,
      }),
    );
  }
  async usage(id: string, days: unknown) {
    if (!apiId(id) || !['7', '30', '90'].includes(String(days)))
      throw new BadRequestException('Elegí un período de 7, 30 o 90 días.');
    await this.get(id);
    const to = new Date();
    return this.store.command({
      action: 'usage',
      id,
      from: new Date(to.getTime() - Number(days) * 86400000).toISOString(),
      to: to.toISOString(),
    });
  }
}
