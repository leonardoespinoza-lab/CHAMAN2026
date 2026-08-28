import { Controller, Get, Header } from '@nestjs/common';
import { buildReleaseMetadata } from 'modelos/src';

@Controller()
export class VersionController {
  @Get('version')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  getVersion() {
    return buildReleaseMetadata('sdc-api-cliente', process.env);
  }
}
