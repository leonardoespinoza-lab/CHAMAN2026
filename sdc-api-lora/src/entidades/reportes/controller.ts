import { Controller, Post, Body, Query } from '@nestjs/common';

import { Event, Uplink } from 'src/auxiliares/chirpstack/interfaces';
import { ReportesService, SENTEK_12_CONFIG, SENTEK_9_CONFIG } from './service';

@Controller('/reportes')
export class ReportesController {
  constructor(private readonly service: ReportesService) {}

  /**
   * Endpoint para los reportes de la lanza Milesight UC501 con sensor Sentek de 9 profundidades.
   */
  @Post('/milesight-501-sentek9')
  public async createMilesight501Sentek9(
    @Body() body: Uplink,
    @Query('event') event: Event,
  ): Promise<void> {
    // Llama al método genérico del servicio, inyectando la CONFIGURACIÓN PARA SENTEK 9.
    return this.service.procesarReporte(body, event, SENTEK_9_CONFIG);
  }

  /**
   * Endpoint para los reportes de la lanza Milesight UC501 con sensor Sentek de 12 profundidades.
   */
  @Post('/milesight-501-sentek12')
  public async createMilesight501Sentek12(
    @Body() body: Uplink,
    @Query('event') event: Event,
  ): Promise<void> {
    // Llama al mismo método genérico, pero inyectando la CONFIGURACIÓN PARA SENTEK 12.
    return this.service.procesarReporte(body, event, SENTEK_12_CONFIG);
  }
}
