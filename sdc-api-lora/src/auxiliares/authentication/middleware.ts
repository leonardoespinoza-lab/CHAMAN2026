import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Injectable()
export class AuthenticationMiddleware implements NestMiddleware {
  constructor() {}

  async use(req: Request, res: Response, next: () => void) {
    const apikey = req?.headers?.apikey as string;
    if (!apikey) {
      throw new UnauthorizedException({
        message: 'No se ha encontrado la apikey',
      });
    }
    if (apikey === process.env.APIKEY_CHIRPSTACK) {
      next();
    } else {
      throw new UnauthorizedException({
        message: 'APIKEY no válida',
      });
    }
  }
}
