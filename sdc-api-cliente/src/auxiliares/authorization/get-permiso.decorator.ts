import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { IPermiso } from 'modelos/src';

export const GetPermiso = createParamDecorator(
  (_data, ctx: ExecutionContext): IPermiso => {
    const res = ctx.switchToHttp().getResponse();
    return res.locals?.permiso;
  },
);
