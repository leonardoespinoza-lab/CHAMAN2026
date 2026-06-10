import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ILicencia } from 'modelos/src';

export const GetLicencia = createParamDecorator(
  (_data, ctx: ExecutionContext): ILicencia => {
    const res = ctx.switchToHttp().getResponse();
    return res.locals?.licencia;
  },
);
