import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { EndpointsService } from './service';
import { PermisoGuard } from '../auxiliares/authorization/permiso.guard';
import { Permisos } from '../auxiliares/authorization/permiso.decorator';
import { GetApiKey } from '../auxiliares/authorization/get-apikey.decorator';
import { Cultivo, IApikey } from 'modelos/src';
import {
  ResponseDiseasePrediction,
  ResponseIrrigationPrediction,
  CreateProducer,
  SowingId,
  Departments,
  Seeds,
  ResponseCreateProducer,
  RequestPrediction,
  Crop,
} from './schemas';

@ApiTags('Endpoints')
@Controller('v1')
@UseGuards(PermisoGuard)
export class EndpointsController {
  constructor(private service: EndpointsService) {}

  @Post('producer')
  @Permisos(
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
  )
  @ApiHeader({
    name: 'apikey',
    required: true,
    description: 'API Key de administrador',
  })
  @ApiResponse({
    status: 200,
    description: 'Crea un productor y devuelve un apikey del productor creado',
    type: ResponseCreateProducer,
  })
  public async createProductor(
    @GetApiKey() apikey: IApikey,
    @Body() body: CreateProducer,
  ) {
    return await this.service.createProductor(body, apikey);
  }

  @Get('departments')
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
  )
  @ApiHeader({
    name: 'apikey',
    required: true,
    description: 'API Key del productor',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de departamentos',
    type: Departments,
  })
  public async getDepartamentos() {
    return await this.service.getDepartamentos();
  }

  @Get('seeds')
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
  )
  @ApiHeader({
    name: 'apikey',
    required: true,
    description: 'API Key del productor',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de semillas',
    type: Seeds,
  })
  @ApiQuery({
    name: 'cultivo',
    required: false,
    enum: Crop,
  })
  public async getSemillas(@Query('cultivo') cultivo: Cultivo): Promise<Seeds> {
    return await this.service.getSemillas(cultivo);
  }

  @Post('request-prediction')
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
  )
  @ApiHeader({
    name: 'apikey',
    required: true,
    description: 'API Key del productor',
  })
  @ApiResponse({
    status: 200,
    description: 'devuelve un id de la siembra creada para la predicción',
    type: SowingId,
  })
  public async solicitarPrediccion(
    @GetApiKey() apikey: IApikey,
    @Body() body: RequestPrediction,
  ) {
    return await this.service.solicitarPrediccion(apikey, body);
  }

  @Get('irrigation-prediction/:idSiembra')
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
  )
  @ApiHeader({
    name: 'apikey',
    required: true,
    description: 'API Key del productor',
  })
  @ApiResponse({
    status: 200,
    description: '',
    type: ResponseIrrigationPrediction,
  })
  @ApiQuery({
    name: 'fecha',
    required: false,
    description:
      'fecha de la predicción en formato 2024-12-31, si no se envía se devuelve la ultima prediccion',
    type: String,
  })
  public async consultarPrediccionRiego(
    @GetApiKey() apikey: IApikey,
    @Param('idSiembra') idSiembra: string,
    @Query('fecha') fecha: string,
  ) {
    return await this.service.consultarPrediccionRiego(
      apikey,
      idSiembra,
      fecha,
    );
  }

  @Get('disease-prediction/:idSiembra')
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
  )
  @ApiHeader({
    name: 'apikey',
    required: true,
    description: 'API Key del productor',
  })
  @ApiResponse({
    status: 200,
    description: '',
    type: ResponseDiseasePrediction,
  })
  @ApiQuery({
    name: 'fecha',
    required: false,
    description:
      'fecha de la prediccion en formato 2024-12-31, si no se envia se devuelve la ultima prediccion',
    type: String,
  })
  public async consultarPrediccionEnfermedades(
    @GetApiKey() apikey: IApikey,
    @Param('idSiembra') idSiembra: string,
    @Query('fecha') fecha: string,
  ) {
    return await this.service.consultarPrediccionEnfermedades(
      apikey,
      idSiembra,
      fecha,
    );
  }
}
