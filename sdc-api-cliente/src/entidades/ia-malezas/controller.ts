import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { IQueryParam } from 'modelos/src';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { IaMalezasService } from './service';

@ApiTags('IA Malezas')
@Controller('ia-malezas')
@UseGuards(PermisoGuard)
export class IaMalezasController {
  constructor(private service: IaMalezasService) {}

  @Get('health')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async health() {
    return await this.service.health();
  }

  @Get()
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async get(@Query() query: IQueryParam) {
    return await this.service.get(query);
  }

  @Post('upload')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  @UseInterceptors(
    FilesInterceptor('images', 12, {
      limits: { fileSize: 12 * 1024 * 1024, files: 12 },
    }),
  )
  public async upload(
    @UploadedFiles() files: any[],
    @Body() body: Record<string, any>,
  ) {
    return await this.service.upload(files, body);
  }

  @Post(':id/analyze')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async analyze(@Param('id') id: string) {
    return await this.service.analyze(id);
  }

  @Get(':id/imagen/:tipo')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async image(
    @Param('id') id: string,
    @Param('tipo') tipo: 'original' | 'procesada',
    @Res() res: Response,
  ) {
    if (tipo !== 'original' && tipo !== 'procesada') {
      return res.status(400).json({ message: 'Tipo de imagen invalido' });
    }
    const path = await this.service.imagePath(id, tipo);
    return res.sendFile(path);
  }

  @Get(':id')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Delete(':id')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async delete(@Param('id') id: string) {
    return await this.service.delete(id);
  }
}
