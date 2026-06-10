import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { IUsuario } from 'modelos/src';

export const GetUser = createParamDecorator(
  (_data, ctx: ExecutionContext): IUsuario => {
    const res = ctx.switchToHttp().getResponse();
    return res.locals?.token?.user;
  },
);
