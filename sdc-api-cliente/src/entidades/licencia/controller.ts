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
import { LicenciasService } from './service';
import {
  ILicencia,
  IListado,
  IQueryParam,
  ICreateLicencia,
  IUpdateLicencia,
  IUsuario,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { GetUser } from '../../auxiliares/authorization/get-token.decorator';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';

@ApiTags('Licencias')
@Controller('licencias')
@UseGuards(PermisoGuard)
export class LicenciasController {
  constructor(private service: LicenciasService) {}

  @Get()
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Distribuidor', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin'] },
    { nivel: 'Establecimiento', roles: ['Admin'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async get(
    @Query() query: IQueryParam,
    @GetUser() user: IUsuario,
  ): Promise<IListado<ILicencia>> {
    return await this.service.get(query, user);
  }

  @Get('/:id')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Distribuidor', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin'] },
    { nivel: 'Establecimiento', roles: ['Admin'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async getById(@Param('id') id: string): Promise<ILicencia> {
    return await this.service.getById(id);
  }

  @Post()
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async create(@Body() body: ICreateLicencia): Promise<ILicencia> {
    return await this.service.create(body);
  }

  @Put('/:id')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async update(
    @Param('id') id: string,
    @Body() body: IUpdateLicencia,
  ): Promise<ILicencia> {
    return await this.service.update(id, body);
  }

  @Delete('/:id')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async delete(@Param('id') id: string): Promise<ILicencia> {
    return await this.service.delete(id);
  }
}
