import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { UsuariosRepository } from '../entidades/usuario/repository';
import { LicenciaPorEntidadsService } from '../entidades/licenciaPorEntidad/service';
import { AdvisorScopeService } from '../auxiliares/authorization/advisor-scope.service';
import { IntegrationRegistry } from './registry';
import { IntegrationRuntime } from './runtime';
import { Scope } from './contract';

export const IntegrationScope = (scope: Scope | 'status') =>
  SetMetadata('integrationScope', scope);
@Injectable()
export class IntegrationGuard implements CanActivate {
  constructor(
    private registry: IntegrationRegistry,
    private reflector: Reflector,
    private users: UsuariosRepository,
    private licenses: LicenciaPorEntidadsService,
    private advisors: AdvisorScopeService,
    private runtime: IntegrationRuntime,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    res.setHeader('Cache-Control', 'no-store');
    const client = this.registry.authenticate(req.headers['x-api-key']);
    const scope = this.reflector.get<Scope | 'status'>(
      'integrationScope',
      context.getHandler(),
    );
    if (!scope || (scope !== 'status' && !client.scopes.includes(scope)))
      throw new ForbiddenException(
        'Servicio no habilitado para esta integración.',
      );
    try {
      await this.runtime.rateLimit(client.id, client.requestsPerMinute);
    } catch (error) {
      if (error?.getStatus?.() === 429) res.setHeader('Retry-After', '60');
      throw error;
    }
    let user;
    try {
      user = await this.users.getById(client.advisorUserId);
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo verificar la cuenta operadora.',
      );
    }
    const permission = structuredClone(
      user?.permisos?.[client.permissionIndex],
    );
    if (
      !user ||
      user.archivado ||
      user.activo !== true ||
      permission?.nivel !== 'Asesor' ||
      !['Admin', 'Escritura', 'Lectura'].includes(permission.rol)
    )
      throw new ForbiddenException('La cuenta operadora no está habilitada.');
    if (scope === 'estructura:crear' && permission.rol === 'Lectura')
      throw new ForbiddenException(
        'La cuenta operadora no tiene permiso de escritura.',
      );
    if (
      scope === 'fenologia:leer' &&
      permission.modulos?.EtapasFenologicas === false
    )
      throw new ForbiddenException('Fenología no habilitada para esta cuenta.');
    // No assigned third-party portfolios: integration access is restricted further to its own deterministic IDs.
    permission.idEstablecimientos = [];
    let license;
    try {
      await this.advisors.enrichPermission(permission, client.advisorUserId);
      license = await this.licenses.getLicenciaEfectivaPorPermiso(permission);
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo verificar el alcance o plan de la integración.',
      );
    }
    if (!license?._id)
      throw new ForbiddenException('Se requiere un plan efectivo persistido.');
    const requestId = randomUUID();
    res.setHeader('X-Request-Id', requestId);
    res.locals.integration = { client, permission, license, requestId };
    // Do not populate the personal-login token or permit integration keys on app routes.
    return true;
  }
}
