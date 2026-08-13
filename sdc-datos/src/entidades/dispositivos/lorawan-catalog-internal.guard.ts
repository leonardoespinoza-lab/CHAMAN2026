import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { ENV, LORAWAN_CATALOG_INTERNAL_TOKEN } from '../../env';

@Injectable()
export class LorawanCatalogInternalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!LORAWAN_CATALOG_INTERNAL_TOKEN) {
      if (
        ENV === 'production' ||
        process.env.NODE_ENV === 'production' ||
        process.env.RAILWAY_ENVIRONMENT_NAME === 'production'
      ) {
        throw new ServiceUnavailableException(
          'LORAWAN_CATALOG_INTERNAL_TOKEN no configurado',
        );
      }
      return true;
    }
    const provided = `${context.switchToHttp().getRequest()?.headers?.['x-chaman-internal-token'] || ''}`;
    const expected = Buffer.from(LORAWAN_CATALOG_INTERNAL_TOKEN);
    const received = Buffer.from(provided);
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      throw new UnauthorizedException('Token interno invalido');
    }
    return true;
  }
}
