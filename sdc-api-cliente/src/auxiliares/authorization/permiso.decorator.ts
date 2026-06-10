import { SetMetadata } from '@nestjs/common';
import { NivelPermiso, Rol } from 'modelos/src';

export const Permisos = (
  ...permisos: { nivel: NivelPermiso; roles: Rol[] }[]
) => SetMetadata('permisos', permisos);
