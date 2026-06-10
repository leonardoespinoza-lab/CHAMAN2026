import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { IApikey } from 'modelos/src';

export const GetApiKey = createParamDecorator(
  (_data, ctx: ExecutionContext): IApikey => {
    const res = ctx.switchToHttp().getResponse();
    return res.locals.apikey;
  },
);
