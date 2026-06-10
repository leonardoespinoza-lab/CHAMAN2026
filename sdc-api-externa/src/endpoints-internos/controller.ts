import { Body, Controller, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { EndpointsService } from './service';
import { IReporteNDVIExterno } from 'modelos/src';

@ApiExcludeController()
@Controller('ndvi')
export class EndpointsController {
  constructor(private service: EndpointsService) {}

  @Post('crear-reporte')
  public async createReporte(@Body() body: IReporteNDVIExterno) {
    return await this.service.createReporte(body);
  }
}
