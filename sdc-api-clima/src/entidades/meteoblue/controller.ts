import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MeteoblueService } from './service';

@ApiTags('Meteoblue')
@Controller('meteoblue')
export class MeteoblueController {
  constructor(private service: MeteoblueService) {}

  @Get('estado')
  public estado() {
    return {
      configurado: this.service.isConfigured(),
      fuente: 'Meteoblue',
      uso:
        'Fuente climatica profesional opcional para contrastar Open-Meteo y mejorar calidad de datos.',
    };
  }

  @Get('pronostico/:lat/:lng/:dias')
  public async pronostico(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
    @Param('dias') dias: number,
  ) {
    return this.service.getPronostico({ lat: +lat, lng: +lng }, +dias || 7);
  }

  @Get('comparar/:lat/:lng/:dias')
  public async comparar(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
    @Param('dias') dias: number,
  ) {
    return this.service.compararConOpenMeteo(
      { lat: +lat, lng: +lng },
      +dias || 7,
    );
  }
}
