import {
  Controller,
  Get,
  Logger,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PrincipioActivosService } from './service';
import { IPrincipioActivo, IListado, IQueryParam } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { PERMISOS_AUTENTICADOS } from '../../auxiliares/authorization/permisos-authenticados';

@ApiTags('PrincipioActivoes')
@Controller('principioactivos')
@UseGuards(PermisoGuard)
export class PrincipioActivosController {
  private logger = new Logger(PrincipioActivosController.name);

  constructor(private service: PrincipioActivosService) {}

  @Get()
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async get(
    @Query() query: IQueryParam,
  ): Promise<IListado<IPrincipioActivo>> {
    return await this.service.get(query);
  }

  @Get('/:id')
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async getById(@Param('id') id: string): Promise<IPrincipioActivo> {
    return await this.service.getById(id);
  }
}
