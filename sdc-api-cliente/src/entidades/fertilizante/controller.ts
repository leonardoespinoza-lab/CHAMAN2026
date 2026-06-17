import {
  Controller,
  Get,
  Logger,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FertilizantesService } from './service';
import { IFertilizante, IListado, IQueryParam } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { PERMISOS_AUTENTICADOS } from '../../auxiliares/authorization/permisos-authenticados';

@ApiTags('Fertilizantees')
@Controller('fertilizantes')
@UseGuards(PermisoGuard)
export class FertilizantesController {
  private logger = new Logger(FertilizantesController.name);

  constructor(private service: FertilizantesService) {}

  @Get()
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async get(
    @Query() query: IQueryParam,
  ): Promise<IListado<IFertilizante>> {
    return await this.service.get(query);
  }

  @Get('/:id')
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async getById(@Param('id') id: string): Promise<IFertilizante> {
    return await this.service.getById(id);
  }
}
