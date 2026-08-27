import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { CHAMAN_METEO_INTERNAL_TOKEN, ENV } from '../../env';

@Injectable()
export class ChamanMeteoInternalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!CHAMAN_METEO_INTERNAL_TOKEN) {
      const runtimeEnvironments = [
        process.env.RAILWAY_ENVIRONMENT_NAME,
        process.env.NODE_ENV,
        ENV,
      ].map((value) => String(value || '').trim().toLowerCase());
      if (
        !!process.env.RAILWAY_ENVIRONMENT_NAME ||
        runtimeEnvironments.includes('production')
      ) {
        throw new ServiceUnavailableException(
          'El canal interno de Chaman-Meteo no esta configurado.',
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
    const right = Buffer.from(CHAMAN_METEO_INTERNAL_TOKEN);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new UnauthorizedException('Canal interno no autorizado.');
    }
    return true;
  }
}
