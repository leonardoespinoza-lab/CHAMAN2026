import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check(): string {
    return 'vivo';
  }

  @Get('/check')
  check2(): string {
    return 'vivo';
  }
}
