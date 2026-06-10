import { Body, Controller, Logger, Post } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';

@Controller('scheduler')
export class SchedulerController {
  private logger = new Logger(SchedulerController.name);
  constructor(private service: SchedulerService) {}

  /**
   * @access public RECONTRA PUBLIC (Solo por API)
   * */
  @Post('despachos')
  public async despachos(@Body() body: any) {
    this.logger.debug(`Recibida creación de despacho por API`);
    // await this.service.despachosExternos(body);
  }
}
