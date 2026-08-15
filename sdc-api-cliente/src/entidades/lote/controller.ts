import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { LotesService } from './service';
import {
  ILote,
  IListado,
  IQueryParam,
  ICreateLote,
  IUpdateLote,
  IPermiso,
  ICargaFitosanitaria,
  IEntradasAgronomicasSuelo,
  IInteligenciaSueloLote,
  IUsuario,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { GetPermiso } from '../../auxiliares/authorization/get-permiso.decorator';
import { Response } from 'express';
import { GetUser } from '../../auxiliares/authorization/get-token.decorator';

@ApiTags('Lotes')
@Controller('lotes')
@UseGuards(PermisoGuard)
export class LotesController {
  constructor(private service: LotesService) {}

  @Get()
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] },
    { nivel: 'Tenant', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async get(
    @Query() query: IQueryParam,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IListado<ILote>> {
    return await this.service.get(query, permiso);
  }

  @Get('suelo-inta')
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] },
    { nivel: 'Tenant', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async getSueloInta(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
  ): Promise<any> {
    return await this.service.getSueloInta(lat, lng);
  }

  @Get('ndvi/status')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async getNdviQueueStatus(): Promise<any> {
    return await this.service.getNdviQueueStatus();
  }

  @Post('ndvi/normalizar')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async normalizarNdviLegacy(@Query('limit') limit?: string): Promise<{
    total: number;
    encolados: number;
    omitidos: number;
    lotesUnicos: number;
  }> {
    return await this.service.normalizarNdviLegacy(Number(limit) || undefined);
  }

  @Get('/:id/certificado')
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] },
    { nivel: 'Tenant', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async generarCertificado(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
    @GetUser() user: IUsuario,
    @Res() res: Response,
  ): Promise<void> {
    const pdf = await this.service.generarCertificadoPdf(id, permiso, user);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="informe-agronomico-chaman-${id}.pdf"`,
    );
    res.setHeader('Content-Length', String(pdf.length));
    res.end(pdf);
  }

  @Get('/:id/carga-fitosanitaria')
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] },
    { nivel: 'Tenant', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async getCargaFitosanitaria(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<ICargaFitosanitaria> {
    return await this.service.getCargaFitosanitaria(id, permiso);
  }

  @Get('/:id/ubicacion')
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] },
    { nivel: 'Tenant', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async getUbicacionAdministrativa(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ) {
    return await this.service.getAdministrativeLocation(id, permiso);
  }

  @Post('/:id/ubicacion/reprocesar')
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
  )
  public async reprocesarUbicacionAdministrativa(
    @Param('id') id: string,
    @Query('force') force: string,
    @GetPermiso() permiso: IPermiso,
  ) {
    return await this.service.resolveAdministrativeLocation(
      id,
      permiso,
      force === 'true',
    );
  }

  @Get('/:id/suelo-ambiente')
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] },
    { nivel: 'Tenant', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async getSoilIntelligence(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IInteligenciaSueloLote | null> {
    return this.service.getSoilIntelligence(id, permiso);
  }

  @Get('/:id/entradas-agronomicas-suelo')
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] },
    { nivel: 'Tenant', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async getSoilAgronomicInputs(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IEntradasAgronomicasSuelo | null> {
    return this.service.getSoilAgronomicInputs(id, permiso);
  }

  @Post('/:id/suelo-ambiente/reprocesar')
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
  )
  public async reprocessSoilIntelligence(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IInteligenciaSueloLote> {
    return this.service.reprocessSoilIntelligence(id, permiso);
  }

  @Get('/:id')
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] },
    { nivel: 'Tenant', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async getById(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<ILote> {
    return await this.service.getById(id, permiso);
  }

  @Post()
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
  )
  public async create(
    @Body() body: ICreateLote,
    @GetPermiso() permiso: IPermiso,
  ): Promise<ILote> {
    return await this.service.create(body, permiso);
  }

  @Post('/:id/ndvi')
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
  )
  public async generarNdvi(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<{
    encolado: boolean;
    mensaje: string;
    ultimaFechaImagen?: string | null;
  }> {
    return await this.service.generarNdvi(id, permiso);
  }

  @Get('capacidad-campo/:idSonda/:fecha')
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
  )
  public async calcularCapacidadCampo(
    @Param('idSonda') idSonda: string,
    @Param('fecha') fecha: string,
  ) {
    return await this.service.calcularCapacidadCampo(idSonda, fecha);
  }

  @Put('/:id')
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
  )
  public async update(
    @Param('id') id: string,
    @Body() body: IUpdateLote,
    @GetPermiso() permiso: IPermiso,
  ): Promise<ILote> {
    return await this.service.update(id, body, permiso);
  }

  @Delete('/:id')
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
  )
  public async delete(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
    @GetUser() user: IUsuario,
  ): Promise<ILote> {
    return await this.service.delete(id, permiso, user);
  }
}
