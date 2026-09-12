import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Injectable,
  NotFoundException,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { IntegrationControlService } from './service';

@Injectable()
export class IntegrationControlGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    if (process.env.CHAMAN_INTEGRATIONS_ADMIN_ENABLED !== 'true')
      throw new NotFoundException();
    const secret = process.env.CHAMAN_INTEGRATIONS_INTERNAL_TOKEN || '';
    const actual = ctx.switchToHttp().getRequest().headers[
      'x-integration-control-token'
    ];
    if (
      secret.length < 32 ||
      typeof actual !== 'string' ||
      actual.length > 200 ||
      Buffer.byteLength(actual) !== Buffer.byteLength(secret) ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(secret))
    )
      throw new UnauthorizedException('Acceso interno no autorizado.');
    return true;
  }
}
@Controller('internal/integration-control')
@UseGuards(IntegrationControlGuard)
export class IntegrationControlController {
  constructor(private readonly service: IntegrationControlService) {}
  @Post('command')
  command(@Body() body: unknown) {
    return this.service.command(body);
  }
}
