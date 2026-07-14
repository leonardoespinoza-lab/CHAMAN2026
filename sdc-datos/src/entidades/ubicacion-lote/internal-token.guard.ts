import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { ENV, LOT_LOCATION_INTERNAL_TOKEN } from '../../env';

@Injectable()
export class LotLocationInternalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!LOT_LOCATION_INTERNAL_TOKEN) {
      if (ENV === 'production') {
        throw new ServiceUnavailableException(
          'LOT_LOCATION_INTERNAL_TOKEN no configurado',
        );
      }
      return true;
    }
    const provided = `${context.switchToHttp().getRequest()?.headers?.['x-chaman-internal-token'] || ''}`;
    const expectedBuffer = Buffer.from(LOT_LOCATION_INTERNAL_TOKEN);
    const providedBuffer = Buffer.from(provided);
    if (
      expectedBuffer.length !== providedBuffer.length ||
      !timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      throw new UnauthorizedException('Token interno invalido');
    }
    return true;
  }
}
