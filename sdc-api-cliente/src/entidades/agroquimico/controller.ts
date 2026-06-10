import {
  Controller,
  Get,
  Logger,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AgroquimicosService } from './service';
import { IAgroquimico, IListado, IQueryParam } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';

@ApiTags('Agroquimicoes')
@Controller('agroquimicos')
@UseGuards(PermisoGuard)
export class AgroquimicosController {
  private logger = new Logger(AgroquimicosController.name);

  constructor(private service: AgroquimicosService) {}

  @Get()
  public async get(
    @Query() query: IQueryParam,
  ): Promise<IListado<IAgroquimico>> {
    return await this.service.get(query);
  }

  @Get('/:id')
  public async getById(@Param('id') id: string): Promise<IAgroquimico> {
    return await this.service.getById(id);
  }

  @Get('/nombre/:nombre')
  public async getByNombre(
    @Param('nombre') nombre: string,
  ): Promise<IAgroquimico> {
    return await this.service.getByNombre(nombre);
  }
}
