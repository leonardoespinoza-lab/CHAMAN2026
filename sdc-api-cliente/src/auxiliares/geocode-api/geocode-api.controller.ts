import { Body, Controller, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GeocodesService } from './geocode-api.service';
import { DireccionV2, ICoordenadas, IGeoJSONPoint, IZonaGeografica } from 'modelos/src';
import { PermisoGuard } from '../authorization/permiso.guard';
import { Permisos } from '../authorization/permiso.decorator';

@ApiTags('GeoCode')
@Controller('geocode')
@UseGuards(PermisoGuard)
export class GeocodesController {
  private logger = new Logger(GeocodesController.name);

  constructor(private service: GeocodesService) {}

  @Post('/direcciones')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Distribuidor', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin'] },
    { nivel: 'Establecimiento', roles: ['Admin'] }    
  )
  
  public async direcciones(
    @Body() body: { text: string; pais?: string; coordenadas?: ICoordenadas },
  ): Promise<{ resultados: string[] }> {
    return await this.service.direcciones(
      body.text,
      body.pais,
      body.coordenadas,
    );
  }

  @Post('/zonas')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Distribuidor', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin'] },
    { nivel: 'Establecimiento', roles: ['Admin'] },
  )
  public async zonas(@Body() body: { text: string }): Promise<{ resultados: IZonaGeografica[] }> {
    return await this.service.zonas(body.text);
  }

  @Post('/geocode')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Distribuidor', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin'] },
    { nivel: 'Establecimiento', roles: ['Admin'] },
  )
  public async geocode(@Body() body: { text: string }): Promise<ICoordenadas> {
    return await this.service.geoCode(body.text);
  }

  @Post('/reverse')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Distribuidor', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin'] },
    { nivel: 'Establecimiento', roles: ['Admin'] },
  )
  public async reverse(
    @Body() body: { geojson: IGeoJSONPoint },
  ): Promise<DireccionV2> {
    return await this.service.reverse(body.geojson);
  }
}
