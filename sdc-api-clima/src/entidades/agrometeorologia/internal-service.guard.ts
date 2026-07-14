import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { AGROMETEO_INTERNAL_TOKEN, ENV } from '../../env';

@Injectable()
export class AgrometeorologiaInternalServiceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!AGROMETEO_INTERNAL_TOKEN) {
      if (ENV === 'production') {
        throw new ServiceUnavailableException(
          'El canal interno agrometeorologico no esta configurado.',
        );
      }
      return true;
    }
    const received = String(
      context.switchToHttp().getRequest()?.headers?.[
        'x-chaman-internal-token'
      ] || '',
    );
    if (!this.safeEqual(received, AGROMETEO_INTERNAL_TOKEN)) {
      throw new UnauthorizedException('Canal interno no autorizado.');
    }
    return true;
  }

  private safeEqual(left: string, right: string): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
