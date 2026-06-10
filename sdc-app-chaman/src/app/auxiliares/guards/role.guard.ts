import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { IPermiso, NivelPermiso } from 'modelos/src';
import { HelperService } from '../servicios/helper';

const samePermiso = (a?: IPermiso | null, b?: IPermiso | null): boolean =>
  !!a &&
  !!b &&
  a.nivel === b.nivel &&
  a.rol === b.rol &&
  a.idQuimica === b.idQuimica &&
  a.idDistribuidor === b.idDistribuidor &&
  a.idProductor === b.idProductor &&
  a.idEstablecimiento === b.idEstablecimiento;

const redirectForNivel = (nivel?: NivelPermiso): string => {
  if (nivel === 'Admin') return '/dashboard-admin';
  if (nivel === 'Quimica') return '/dashboard-quimica';
  if (nivel === 'Distribuidor') return '/dashboard-distribuidor';
  if (nivel === 'Productor' || nivel === 'Establecimiento') return '/mapa';
  return '/auth';
};

const getActivePermiso = (helper: HelperService): { permiso: IPermiso | null; index: number } => {
  const permisos = helper.user?.permisos || [];
  if (!permisos.length) return { permiso: null, index: -1 };

  const permisoGuardado = helper.permiso;
  const indiceGuardado = permisos.findIndex((permiso) => samePermiso(permiso, permisoGuardado));
  if (indiceGuardado >= 0) return { permiso: permisos[indiceGuardado], index: indiceGuardado };

  const numeroPermiso = helper.numeroPermiso;
  if (numeroPermiso !== null && permisos[numeroPermiso]) {
    return { permiso: permisos[numeroPermiso], index: numeroPermiso };
  }

  return { permiso: permisos[0], index: 0 };
};

export const roleGuard: CanActivateFn = (route) => {
  const helper = inject(HelperService);
  const router = inject(Router);
  const nivelesPermitidos = route.data?.['niveles'] as NivelPermiso[] | undefined;

  if (!nivelesPermitidos?.length) {
    return true;
  }

  const { permiso, index } = getActivePermiso(helper);
  if (!permiso) {
    return router.createUrlTree(['/auth']);
  }

  helper.setPermiso(permiso);
  helper.setNumeroPermiso(index);

  if (nivelesPermitidos.includes(permiso.nivel)) {
    return true;
  }

  return router.createUrlTree([redirectForNivel(permiso.nivel)]);
};
