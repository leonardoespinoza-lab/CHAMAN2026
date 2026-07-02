import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { EndpointsService } from './service';
import { IReporteNDVIExterno } from 'modelos/src';
import { ENV, NDVI_WORKER_TOKEN } from 'src/env';

@ApiExcludeController()
@Controller('ndvi')
export class EndpointsController {
  constructor(private service: EndpointsService) {}

  @Post('crear-reporte')
  public async createReporte(
    @Body() body: IReporteNDVIExterno,
    @Headers('x-chaman-worker-token') workerToken?: string,
  ) {
    this.validarTokenInterno(workerToken);
    return await this.service.createReporte(body);
  }

  private validarTokenInterno(workerToken?: string): void {
    if (!NDVI_WORKER_TOKEN && ENV !== 'production') {
      return;
    }

    if (!NDVI_WORKER_TOKEN) {
      throw new UnauthorizedException('NDVI worker token no configurado');
    }

    if (!workerToken || workerToken !== NDVI_WORKER_TOKEN) {
      throw new UnauthorizedException('NDVI worker token invalido');
    }
  }
}
