import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IAsignarCamaraLotes,
  ICamara,
  IFoto,
  ILote,
  IListado,
  IQueryParam,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { CamarasService } from './service';

@ApiTags('Camaras')
@Controller('camaras')
@UseGuards(PermisoGuard)
export class CamarasController {
  constructor(private service: CamarasService) {}

  @Get()
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async get(@Query() query: IQueryParam): Promise<IListado<ICamara>> {
    return await this.service.get(query);
  }

  @Post('sincronizar')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async sincronizar(@Query() query: IQueryParam): Promise<IListado<ICamara>> {
    return await this.service.sincronizar(query);
  }

  @Get('lotes/disponibles')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async getLotesDisponibles(): Promise<IListado<ILote>> {
    return await this.service.getLotesDisponibles();
  }

  @Get(':serial/fotos')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async getFotos(
    @Param('serial') serial: string,
    @Query() query: IQueryParam,
  ): Promise<IListado<IFoto>> {
    return await this.service.getFotos(serial, query);
  }

  @Put(':serial/lotes')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async asignarLotes(
    @Param('serial') serial: string,
    @Body() body: IAsignarCamaraLotes,
  ): Promise<IListado<ILote>> {
    return await this.service.asignarLotes(serial, body);
  }

  @Post(':serial/capturar')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async capturar(
    @Param('serial') serial: string,
    @Query('canal') canal?: string,
  ): Promise<any> {
    return await this.service.capturar(serial, Number(canal || 1));
  }
}
