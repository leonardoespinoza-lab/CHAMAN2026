import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IPermiso, NivelPermiso, Rol } from 'modelos/src';

@Injectable()
export class PermisoGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permisosValidos = this.reflector.get<
      { nivel: NivelPermiso; roles: Rol[] }[]
    >('permisos', context.getHandler());

    // Si no se especifica ningún nivel de permiso, se permite el acceso
    if (!permisosValidos?.length) {
      return true;
    }

    // Si se especifica un nivel de permiso, se verifica que el usuario tenga
    const res = context.switchToHttp().getResponse();
    const permisoActual: IPermiso = res.locals?.permiso;

    // Si el permiso activo es Admin, tiene acceso total.
    if (permisoActual?.nivel === 'Admin' && permisoActual.rol === 'Admin') {
      return true;
    }

    if (permisoActual) {
      for (const permisoValido of permisosValidos) {
        if (
          permisoActual.nivel === permisoValido.nivel &&
          permisoValido.roles.includes(permisoActual.rol)
        ) {
          return true;
        }
      }
    }
    return false;
  }
}
