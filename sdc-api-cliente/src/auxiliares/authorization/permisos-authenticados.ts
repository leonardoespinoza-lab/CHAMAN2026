import { NivelPermiso, Rol } from 'modelos/src';

export const PERMISOS_AUTENTICADOS: { nivel: NivelPermiso; roles: Rol[] }[] = [
  { nivel: 'Admin', roles: ['Admin'] },
  { nivel: 'Tenant', roles: ['Admin', 'Escritura', 'Lectura'] },
  { nivel: 'Quimica', roles: ['Admin', 'Escritura', 'Lectura'] },
  { nivel: 'Distribuidor', roles: ['Admin', 'Escritura', 'Lectura'] },
  { nivel: 'Asesor', roles: ['Admin', 'Escritura', 'Lectura'] },
  { nivel: 'Productor', roles: ['Admin', 'Escritura', 'Lectura'] },
  { nivel: 'Establecimiento', roles: ['Admin', 'Escritura', 'Lectura'] },
];
