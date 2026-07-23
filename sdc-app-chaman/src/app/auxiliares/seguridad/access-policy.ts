import { IPermiso, NivelPermiso, Rol } from 'modelos/src';

export const NIVELES_PERMISO: readonly NivelPermiso[] = [
  'Admin',
  'Tenant',
  'Quimica',
  'Distribuidor',
  'Asesor',
  'Productor',
  'Establecimiento',
];

export const ROLES_LECTURA: readonly Rol[] = ['Admin', 'Escritura', 'Lectura'];
export const ROLES_ESCRITURA: readonly Rol[] = ['Admin', 'Escritura'];
export const ROLES_ADMINISTRACION: readonly Rol[] = ['Admin'];

const PRIORIDAD_NIVEL: Readonly<Record<NivelPermiso, number>> = {
  Admin: 7,
  Tenant: 6,
  Quimica: 5,
  Distribuidor: 4,
  Asesor: 3,
  Productor: 2,
  Establecimiento: 1,
};

const idsOrdenados = (values?: string[]): string =>
  JSON.stringify([...(values || [])].map(String).sort());

export const mismoPermiso = (
  a?: IPermiso | null,
  b?: IPermiso | null
): boolean =>
  !!a &&
  !!b &&
  a.nivel === b.nivel &&
  a.rol === b.rol &&
  a.idTenant === b.idTenant &&
  a.idQuimica === b.idQuimica &&
  a.idDistribuidor === b.idDistribuidor &&
  a.idAsesor === b.idAsesor &&
  a.idProductor === b.idProductor &&
  a.idEstablecimiento === b.idEstablecimiento &&
  idsOrdenados(a.idProductores) === idsOrdenados(b.idProductores) &&
  idsOrdenados(a.idEstablecimientos) === idsOrdenados(b.idEstablecimientos) &&
  idsOrdenados(a.idLotes) === idsOrdenados(b.idLotes);

export const indicePermiso = (
  permisos: IPermiso[],
  permiso?: IPermiso | null
): number => permisos.findIndex((item) => mismoPermiso(item, permiso));

export const permisoPrincipal = (
  permisos: IPermiso[]
): IPermiso | undefined =>
  permisos
    .map((permiso, index) => ({ permiso, index }))
    .sort(
      (a, b) =>
        PRIORIDAD_NIVEL[b.permiso.nivel] -
          PRIORIDAD_NIVEL[a.permiso.nivel] ||
        a.index - b.index
    )[0]?.permiso;

export interface PermisoActivo {
  permiso: IPermiso | null;
  index: number;
}

export const resolverPermisoActivo = (
  permisos: IPermiso[],
  permisoGuardado?: IPermiso | null,
  indiceGuardado?: number | null
): PermisoActivo => {
  if (!permisos.length) {
    return { permiso: null, index: -1 };
  }

  const indiceExacto = indicePermiso(permisos, permisoGuardado);
  if (indiceExacto >= 0) {
    return { permiso: permisos[indiceExacto], index: indiceExacto };
  }

  if (
    indiceGuardado !== null &&
    indiceGuardado !== undefined &&
    indiceGuardado >= 0 &&
    permisos[indiceGuardado]
  ) {
    return { permiso: permisos[indiceGuardado], index: indiceGuardado };
  }

  const principal = permisoPrincipal(permisos);
  const index = principal ? permisos.indexOf(principal) : -1;
  return { permiso: principal || null, index };
};

export const rutaInicioPermiso = (
  permiso?: IPermiso | null
): string => {
  if (!permiso) return '/auth';

  switch (permiso.nivel) {
    case 'Admin':
      return permiso.rol === 'Admin' ? '/dashboard-admin' : '/mapa';
    case 'Tenant':
      return '/dashboard-tenant';
    case 'Quimica':
      return '/dashboard-quimica';
    case 'Distribuidor':
    case 'Asesor':
      return '/dashboard-distribuidor';
    case 'Productor':
    case 'Establecimiento':
      return '/mapa';
  }
};

export const esNivelPermiso = (
  permiso: IPermiso | null | undefined,
  ...niveles: NivelPermiso[]
): boolean => !!permiso && niveles.includes(permiso.nivel);

export const puedeEscribir = (
  permiso?: IPermiso | null
): boolean =>
  !!permiso && (permiso.rol === 'Admin' || permiso.rol === 'Escritura');

export const puedeAdministrar = (
  permiso?: IPermiso | null
): boolean => permiso?.rol === 'Admin';

export const etiquetaNivel = (nivel?: NivelPermiso): string => {
  if (nivel === 'Quimica') return 'Compañía';
  return nivel || 'Sin alcance';
};
