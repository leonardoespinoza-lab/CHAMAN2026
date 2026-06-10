import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CronosService } from './service';
import { ICrono, IListado, IQueryParam } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';

@ApiTags('Crono')
@Controller('cronos')
@UseGuards(PermisoGuard)
export class CronosController {
  constructor(private service: CronosService) {}

  @Get()
  public async get(@Query() query: IQueryParam): Promise<IListado<ICrono>> {
    return await this.service.get(query);
  }

  @Get('/:id')
  public async getById(@Param('id') id: string): Promise<ICrono> {
    return await this.service.getById(id);
  }
}
