import {
  Controller,
  Delete,
  Body,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFiles,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { FotosService } from './service';
import { IListado, IQueryParam, IPermiso, IFoto, IUpdateFoto, IUsuario } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { GetPermiso } from '../../auxiliares/authorization/get-permiso.decorator';
import { PERMISOS_AUTENTICADOS } from '../../auxiliares/authorization/permisos-authenticados';
import { GetUser } from '../../auxiliares/authorization/get-token.decorator';

@ApiTags('Fotos')
@Controller('fotos')
@UseGuards(PermisoGuard)
export class FotosController {
  constructor(private service: FotosService) {}

  @Get('imagen')
  @Permisos(...PERMISOS_AUTENTICADOS)
  async getImage(
    @Query('id') id: string,
    @GetPermiso() permiso: IPermiso,
    @Res() res: Response,
  ): Promise<void> {
    const image = await this.service.getImagen(id, permiso);
    res.setHeader('Content-Type', imageContentType(image));
    res.setHeader('Content-Length', String(image.length));
    res.setHeader(
      'Cache-Control',
      'private, max-age=300, stale-while-revalidate=60',
    );
    res.send(image);
  }

  @Get('audio')
  @Permisos(...PERMISOS_AUTENTICADOS)
  async getAudio(
    @Query('id') id: string,
    @GetPermiso() permiso: IPermiso,
    @Res() res: Response,
  ): Promise<void> {
    const audio = await this.service.getAudio(id, permiso);
    res.setHeader('Content-Type', audio.mimeType);
    res.setHeader('Content-Length', String(audio.bytes.length));
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', 'inline');
    res.send(audio.bytes);
  }

  @Get()
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async get(
    @Query() query: IQueryParam,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IListado<IFoto>> {
    return await this.service.get(query, permiso);
  }

  @Get('lote/:id')
  @Permisos(
    { nivel: 'Tenant', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async getByLoteId(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IListado<IFoto>> {
    return await this.service.getByIdLote(id, permiso);
  }

  @Get('/:id')
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async getById(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IFoto> {
    return await this.service.getById(id, permiso);
  }

  @Post('campo/upload')
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] },
    { nivel: 'Tenant', roles: ['Admin', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura'] },
  )
  @UseInterceptors(
    FilesInterceptor('images', 8, {
      limits: { fileSize: 12 * 1024 * 1024, files: 8 },
    }),
  )
  public async uploadCampo(
    @UploadedFiles() files: any[],
    @Body() body: Record<string, any>,
    @GetPermiso() permiso: IPermiso,
    @GetUser() user: IUsuario,
  ): Promise<IFoto[]> {
    return await this.service.uploadCampo(files, body, permiso, user);
  }

  @Post('campo/audio/upload')
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] },
    { nivel: 'Tenant', roles: ['Admin', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura'] },
  )
  @UseInterceptors(
    FileInterceptor('audio', { limits: { fileSize: 25 * 1024 * 1024 } }),
  )
  public async uploadAudio(
    @UploadedFile() file: any,
    @Body() body: Record<string, any>,
    @GetPermiso() permiso: IPermiso,
    @GetUser() user: IUsuario,
  ): Promise<IFoto> {
    return await this.service.uploadAudio(file, body, permiso, user);
  }

  @Put('/:id')
  @Permisos(
    { nivel: 'Tenant', roles: ['Admin', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async update(
    @Param('id') id: string,
    @Body() body: IUpdateFoto,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IFoto> {
    return await this.service.update(id, body, permiso);
  }

  @Delete('/:id')
  @Permisos(
    { nivel: 'Tenant', roles: ['Admin', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async delete(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IFoto> {
    return await this.service.delete(id, permiso);
  }
}

export function imageContentType(image: Buffer): string {
  if (
    image.length >= 8 &&
    image
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    image.length >= 12 &&
    image.toString('ascii', 0, 4) === 'RIFF' &&
    image.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (
    image.length >= 3 &&
    image[0] === 0xff &&
    image[1] === 0xd8 &&
    image[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  return 'application/octet-stream';
}
