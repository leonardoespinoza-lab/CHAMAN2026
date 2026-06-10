import { Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CronService } from './service';

@ApiTags('Cron')
@Controller('cron')
export class CronController {
  constructor(private service: CronService) {}

  @Post('actualizar')
  public async actualizar() {
    return await this.service.actualizarEstaciones();
  }
}
