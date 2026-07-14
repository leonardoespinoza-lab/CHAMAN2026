import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { AGROMETEO_INTERNAL_TOKEN, ENV } from '../env';

@Injectable()
export class AgrometeorologiaStorageGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!AGROMETEO_INTERNAL_TOKEN) {
      if (ENV === 'production') {
        throw new ServiceUnavailableException(
          'El almacenamiento agrometeorologico interno no esta configurado.',
        );
      }
      return true;
    }
    const received = String(
      context.switchToHttp().getRequest()?.headers?.[
        'x-chaman-internal-token'
      ] || '',
    );
    const left = Buffer.from(received);
    const right = Buffer.from(AGROMETEO_INTERNAL_TOKEN);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new UnauthorizedException('Canal interno no autorizado.');
    }
    return true;
  }
}
