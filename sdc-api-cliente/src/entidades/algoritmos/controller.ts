import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { AlgoritmosService } from './service';

@ApiTags('Algoritmos')
@Controller('algoritmos')
@UseGuards(PermisoGuard)
export class AlgoritmosController {
  constructor(private service: AlgoritmosService) {}

  @Get()
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  async getCatalogo(): Promise<any[]> {
    return await this.service.getCatalogo();
  }

  @Get('huella-hidrica/parametros')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  async getParametrosHuellaHidrica(): Promise<any> {
    return await this.service.getParametrosHuellaHidrica();
  }

  @Post('huella-hidrica/simular')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  async simularHuellaHidrica(@Body() body: any): Promise<any> {
    return await this.service.simularHuellaHidrica(body);
  }
}
