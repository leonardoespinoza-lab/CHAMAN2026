import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { NivelPermiso, Rol } from 'modelos/src';
import { HelperService } from '../servicios/helper';
import {
  resolverPermisoActivo,
  rutaInicioPermiso,
} from '../seguridad/access-policy';

export const roleGuard: CanActivateFn = (route) => {
  const helper = inject(HelperService);
  const router = inject(Router);
  const nivelesPermitidos = route.data?.['niveles'] as NivelPermiso[] | undefined;
  const rolesPermitidos = route.data?.['roles'] as Rol[] | undefined;

  if (!nivelesPermitidos?.length) {
    return true;
  }

  const { permiso, index } = resolverPermisoActivo(
    helper.user?.permisos || [],
    helper.permiso,
    helper.numeroPermiso
  );
  if (!permiso) {
    return router.createUrlTree(['/auth']);
  }

  helper.setPermiso(permiso);
  helper.setNumeroPermiso(index);

  if (
    nivelesPermitidos.includes(permiso.nivel) &&
    (!rolesPermitidos?.length || rolesPermitidos.includes(permiso.rol))
  ) {
    return true;
  }

  return router.createUrlTree([rutaInicioPermiso(permiso)]);
};
