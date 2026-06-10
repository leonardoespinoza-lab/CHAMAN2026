import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IUsuario, NivelPermiso, Rol } from 'modelos/src';

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
    const user: IUsuario = res.locals?.token?.user;

    // Si es Admin, que tenga todos los permisos
    if (
      user?.permisos?.some(
        (p) => p.nivel === 'Admin' && p.rol === 'Admin'
      )
    ) {
      return true;
    }

    if (user) {
      for (const permiso of permisosValidos) {
        if (
          user.permisos.some(
            (p) => p.nivel === permiso.nivel && permiso.roles.includes(p.rol),
          )
        ) {
          return true;
        }
      }
    }
    return false;
  }
}
