import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { ChamanMeteoService } from './service';

@ApiTags('Chaman-Meteo Admin')
@Controller('chaman-meteo')
@UseGuards(PermisoGuard)
export class ChamanMeteoController {
  constructor(private readonly service: ChamanMeteoService) {}

  @Get('status')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  status() {
    return this.service.status();
  }

  @Get('grid-points')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  gridPoints(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.service.gridPoints(limit, offset);
  }

  @Get('jobs')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  jobs(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.service.jobs(limit, offset);
  }

  @Get('hourly')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  hourly(
    @Query('gridPointKey') gridPointKey?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.hourly(gridPointKey, limit, offset);
  }

  @Get('daily')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  daily(
    @Query('gridPointKey') gridPointKey?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.daily(gridPointKey, limit, offset);
  }
}
