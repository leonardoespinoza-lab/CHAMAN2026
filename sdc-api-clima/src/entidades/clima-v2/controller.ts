import {
  Controller,
  Get,
  Logger,
  Param,
  ParseArrayPipe,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ClimaV2Service } from './service';
import { Sensores } from 'modelos/src';

export interface IQueryClima {
  lat: number;
  lng: number;
  fechaDesde: string;
  fechaHasta: string;
  agrupacion: 'hourly' | 'daily';
  sensores?: Sensores[];
  distancia?: number;
}

@ApiTags('Clima V2')
@Controller('climav2')
export class ClimaV2Controller {
  private logger = new Logger(ClimaV2Controller.name);

  constructor(private service: ClimaV2Service) {}

  // Datos entre fechas por ubicacion

  @Get('historico')
  public async getClima(
    @Query('lat') lat: number,
    @Query('lng') lng: number,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
    @Query('agrupacion') agrupacion?: 'hourly' | 'daily',
    @Query('sensores', new ParseArrayPipe({ items: String, separator: ',' })) // Parsea un array de strings derecho del query param
    sensores?: Sensores[],
    @Query('distancia') distancia?: number,
  ) {
    return await this.service.getClima(
      { lat, lng },
      agrupacion,
      fechaDesde,
      fechaHasta,
      sensores,
      distancia,
    );
  }

  @Get('suelo/:id/:desde/:hasta')
  public async getSuelo(
    @Param('id') id: string,
    @Param('desde') desde: string,
    @Param('hasta') hasta: string,
    @Query('agrupacion') agrupacion?: 'hourly' | 'daily',
  ) {
    return await this.service.getSuelo(id, desde, hasta, agrupacion);
  }

  @Get('pronostico/:lat/:lng/:dias')
  public async getPronostico(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
    @Param('dias') dias: number,
    @Query('agrupacion') agrupacion?: 'hourly' | 'daily',
  ) {
    return await this.service.getPronostico(lat, lng, dias, agrupacion);
  }
}
