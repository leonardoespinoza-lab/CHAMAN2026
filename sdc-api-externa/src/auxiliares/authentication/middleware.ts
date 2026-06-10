import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiKeysService } from '../../entidades/apikey/service';

@Injectable()
export class AuthenticationMiddleware implements NestMiddleware {
  constructor(private service: ApiKeysService) {}

  async use(req: Request, res: Response, next: () => void) {
    const apikey = req?.headers?.apikey as string;
    if (apikey) {
      const apikeyConTipo = await this.service.getByApikey(apikey);
      res.locals.apikey = apikeyConTipo;
      next();
    } else {
      throw new UnauthorizedException({
        message: 'No se ha encontrado la apikey',
      });
    }
  }
}
