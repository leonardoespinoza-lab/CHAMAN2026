import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { ENV, SOIL_INTELLIGENCE_INTERNAL_TOKEN } from '../../env';

@Injectable()
export class SoilIntelligenceInternalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!SOIL_INTELLIGENCE_INTERNAL_TOKEN) {
      if (ENV === 'production' || process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException(
          'SOIL_INTELLIGENCE_INTERNAL_TOKEN no configurado',
        );
      }
      return true;
    }
    const provided = `${context.switchToHttp().getRequest()?.headers?.['x-chaman-internal-token'] || ''}`;
    const expected = Buffer.from(SOIL_INTELLIGENCE_INTERNAL_TOKEN);
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
