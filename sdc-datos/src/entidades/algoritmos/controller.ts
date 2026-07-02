import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AlgoritmosService } from './service';
import { HuellaHidricaParams } from './huella-hidrica.engine';

@ApiTags('Algoritmos')
@Controller('algoritmos')
export class AlgoritmosController {
  constructor(private readonly service: AlgoritmosService) {}

  @Get()
  getCatalogo() {
    return this.service.getCatalogo();
  }

  @Get('catalogos/readiness')
  getReadinessCatalogos() {
    return this.service.getReadinessCatalogos();
  }

  @Get('huella-hidrica/parametros')
  getParametrosHuellaHidrica() {
    return this.service.getParametrosHuellaHidrica();
  }

  @Post('huella-hidrica/simular')
  simularHuellaHidrica(@Body() body: HuellaHidricaParams) {
    return this.service.simularHuellaHidrica(body);
  }

  @Post('enfermedades/simular')
  simularEnfermedades(@Body() body: any) {
    return this.service.simularEnfermedades(body);
  }

  @Post('riego/simular')
  simularRiego(@Body() body: any) {
    return this.service.simularRiego(body);
  }

  @Post('malezas/simular')
  simularMalezas(@Body() body: any) {
    return this.service.simularMalezas(body);
  }
}
