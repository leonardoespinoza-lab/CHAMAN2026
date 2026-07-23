import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CronosService } from './service';
import {
  ICrono,
  ICreateCrono,
  IListado,
  IQueryParam,
  IUpdateCrono,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { PERMISOS_AUTENTICADOS } from '../../auxiliares/authorization/permisos-authenticados';

@ApiTags('Crono')
@Controller('cronos')
@UseGuards(PermisoGuard)
export class CronosController {
  constructor(private service: CronosService) {}

  @Get()
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async get(@Query() query: IQueryParam): Promise<IListado<ICrono>> {
    return await this.service.get(query);
  }

  @Get('/:id')
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async getById(@Param('id') id: string): Promise<ICrono> {
    return await this.service.getById(id);
  }

  @Post()
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async create(@Body() body: ICreateCrono): Promise<ICrono> {
    return await this.service.create(body);
  }

  @Post('/bulk')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async bulk(@Body() body: ICreateCrono[]): Promise<void> {
    return await this.service.bulk(body);
  }

  @Put('/:id')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async update(
    @Param('id') id: string,
    @Body() body: IUpdateCrono,
  ): Promise<ICrono> {
    return await this.service.update(id, body);
  }

  @Delete('/:id')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async delete(@Param('id') id: string): Promise<ICrono> {
    return await this.service.delete(id);
  }
}
