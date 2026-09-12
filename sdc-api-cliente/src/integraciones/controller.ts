import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  IntegrationContext,
  INTEGRATION_PREFIX,
  ResourceType,
} from './contract';
import { IntegrationGuard, IntegrationScope } from './guard';
import { IntegrationsService } from './service';

@Controller(INTEGRATION_PREFIX)
@UseGuards(IntegrationGuard)
export class IntegrationsController {
  constructor(private service: IntegrationsService) {}
  @Get('servicios')
  @IntegrationScope('status')
  services(@Res({ passthrough: true }) res: Response) {
    const ctx: IntegrationContext = res.locals.integration;
    const operations = [
      ...(ctx.client.scopes.includes('estructura:crear') &&
      ctx.permission.rol !== 'Lectura'
        ? ['crear']
        : []),
      ...(ctx.client.scopes.includes('estructura:leer') ? ['consultar'] : []),
    ];
    return {
      version: '1.0',
      entorno: ctx.client.environment || 'testing',
      integracion: ctx.client.id,
      servicios: [
        ...(operations.length
          ? [{ codigo: 'estructura', operaciones: operations }]
          : []),
        ...(ctx.client.scopes.includes('catalogos:leer')
          ? [{ codigo: 'catalogos', operaciones: ['consultar'] }]
          : []),
        ...(ctx.client.scopes.includes('fenologia:leer') &&
        ctx.permission.modulos?.EtapasFenologicas !== false
          ? [{ codigo: 'fenologia', operaciones: ['consultar'] }]
          : []),
      ],
      permisos: ctx.client.scopes,
      solicitudesPorMinuto: ctx.client.requestsPerMinute,
      limites: ctx.client.limits || null,
      antiguedadMaximaSiembraDias: ctx.client.maxSowingAgeDays ?? null,
      actualizacion: 'consulta_periodica',
      webhooks: false,
    };
  }
  @Get('catalogos/semillas')
  @IntegrationScope('catalogos:leer')
  catalog(@Query('cultivo') crop?: string, @Query('pagina') page?: string) {
    return this.service.catalog(crop, page === undefined ? 0 : Number(page));
  }

  private get(kind: ResourceType, id: string, res: Response) {
    return this.service.get(kind, id, res.locals.integration);
  }
  private create(kind: ResourceType, id: string, body: unknown, res: Response) {
    return this.service.create(kind, id, body, res.locals.integration);
  }
  @Get('productores/:externalId')
  @IntegrationScope('estructura:leer')
  producer(
    @Param('externalId') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.get('productores', id, res);
  }
  @Put('productores/:externalId')
  @IntegrationScope('estructura:crear')
  createProducer(
    @Param('externalId') id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.create('productores', id, body, res);
  }
  @Get('establecimientos/:externalId')
  @IntegrationScope('estructura:leer')
  farm(
    @Param('externalId') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.get('establecimientos', id, res);
  }
  @Put('establecimientos/:externalId')
  @IntegrationScope('estructura:crear')
  createFarm(
    @Param('externalId') id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.create('establecimientos', id, body, res);
  }
  @Get('lotes/:externalId')
  @IntegrationScope('estructura:leer')
  lot(
    @Param('externalId') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.get('lotes', id, res);
  }
  @Put('lotes/:externalId')
  @IntegrationScope('estructura:crear')
  createLot(
    @Param('externalId') id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.create('lotes', id, body, res);
  }
  @Get('siembras/:externalId')
  @IntegrationScope('estructura:leer')
  sowing(
    @Param('externalId') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.get('siembras', id, res);
  }
  @Put('siembras/:externalId')
  @IntegrationScope('estructura:crear')
  createSowing(
    @Param('externalId') id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.create('siembras', id, body, res);
  }
  @Get('siembras/:externalId/fenologia')
  @IntegrationScope('fenologia:leer')
  async phenology(
    @Param('externalId') id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.phenology(id, res.locals.integration);
    const etag = `"${result.revision}"`;
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) {
      res.status(304);
      return;
    }
    if (result.estado === 'pendiente') res.status(202);
    return result;
  }
}
