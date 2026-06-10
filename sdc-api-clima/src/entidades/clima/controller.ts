import { Controller, Get, Logger, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HelperService } from '../../auxiliares/helper';
import { ClimaService } from './service';
import { nivelPrediccion } from 'modelos/src';

@ApiTags('Clima')
@Controller('clima')
export class ClimaController {
  private logger = new Logger(ClimaController.name);

  constructor(private service: ClimaService) {}

  // Datos entre fechas por ubicacion

  @Get('estacion/cerca/:lat/:lng/:fechaDesde/:fechaHasta')
  public async getEstacionMasCercanaEntreFechas(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
    @Param('fechaDesde') fechaDesde: string,
    @Param('fechaHasta') fechaHasta: string,
    @Query('dataGroup') dataGroup: 'raw' | 'hourly' | 'daily' | 'monthly',
  ) {
    return await this.service.getEstacionMasCercanaEntreFechas(
      { lat, lng },
      fechaDesde,
      fechaHasta,
      dataGroup,
    );
  }

  @Get('pluviometro/cerca/:lat/:lng/:fechaDesde/:fechaHasta')
  public async getPluviometroMasCercanoEntreFechas(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
    @Param('fechaDesde') fechaDesde: string,
    @Param('fechaHasta') fechaHasta: string,
    @Query('dataGroup') dataGroup: 'raw' | 'hourly' | 'daily' | 'monthly',
  ) {
    return await this.service.getPluviometroMasCercanoEntreFechas(
      { lat, lng },
      fechaDesde,
      fechaHasta,
      dataGroup,
    );
  }

  @Get('suelo/cerca/:lat/:lng/:fechaDesde/:fechaHasta')
  public async getSueloMasCercanoEntreFechas(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
    @Param('fechaDesde') fechaDesde: string,
    @Param('fechaHasta') fechaHasta: string,
    @Query('dataGroup') dataGroup: 'raw' | 'hourly' | 'daily' | 'monthly',
  ) {
    return await this.service.getSueloMasCercanoEntreFechas(
      { lat, lng },
      fechaDesde,
      fechaHasta,
      dataGroup,
    );
  }

  @Get('clima/cerca/:lat/:lng/:fechaDesde/:fechaHasta')
  public async getClimaMasCercanoEntreFechas(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
    @Param('fechaDesde') fechaDesde: string,
    @Param('fechaHasta') fechaHasta: string,
    @Query('dataGroup') dataGroup: 'raw' | 'hourly' | 'daily' | 'monthly',
  ) {
    const [estacion, pluviometro, suelo] = await Promise.all([
      this.service.getEstacionMasCercanaEntreFechas(
        { lat, lng },
        fechaDesde,
        fechaHasta,
        dataGroup,
      ),
      this.service.getPluviometroMasCercanoEntreFechas(
        { lat, lng },
        fechaDesde,
        fechaHasta,
        dataGroup,
      ),
      this.service.getSueloMasCercanoEntreFechas(
        { lat, lng },
        fechaDesde,
        fechaHasta,
        dataGroup,
      ),
    ]);
    return { estacion, pluviometro, suelo };
  }

  // Datos último día por ubicacion

  @Get('estacion/cerca/:lat/:lng')
  public async getEstacionMasCercanaUltimoDato(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
    @Query('dataGroup') dataGroup: 'raw' | 'hourly' | 'daily' | 'monthly',
  ) {
    const { fechaDesde, fechaHasta } = HelperService.fechasUltimoDias(1);
    return await this.service.getEstacionMasCercanaEntreFechas(
      { lat, lng },
      fechaDesde,
      fechaHasta,
      dataGroup,
    );
  }

  @Get('pluviometro/cerca/:lat/:lng')
  public async getPluviometroMasCercanoUltimoDato(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
    @Query('dataGroup') dataGroup: 'raw' | 'hourly' | 'daily' | 'monthly',
  ) {
    const { fechaDesde, fechaHasta } = HelperService.fechasUltimoDias(1);
    return await this.service.getPluviometroMasCercanoEntreFechas(
      { lat, lng },
      fechaDesde,
      fechaHasta,
      dataGroup,
    );
  }

  @Get('suelo/cerca/:lat/:lng')
  public async getSueloMasCercanoUltimoDato(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
    @Query('dataGroup') dataGroup: 'raw' | 'hourly' | 'daily' | 'monthly',
  ) {
    const { fechaDesde, fechaHasta } = HelperService.fechasUltimoDias(1);
    return await this.service.getSueloMasCercanoEntreFechas(
      { lat, lng },
      fechaDesde,
      fechaHasta,
      dataGroup,
    );
  }

  @Get('clima/cerca/:lat/:lng')
  public async getClimaMasCercanoUltimoDato(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
    @Query('dataGroup') dataGroup: 'raw' | 'hourly' | 'daily' | 'monthly',
  ) {
    const { fechaDesde, fechaHasta } = HelperService.fechasUltimoDias(2);
    const [estacion, pluviometro, suelo] = await Promise.all([
      this.service.getEstacionMasCercanaEntreFechas(
        { lat, lng },
        fechaDesde,
        fechaHasta,
        dataGroup,
      ),
      this.service.getPluviometroMasCercanoEntreFechas(
        { lat, lng },
        fechaDesde,
        fechaHasta,
        dataGroup,
      ),
      this.service.getSueloMasCercanoEntreFechas(
        { lat, lng },
        fechaDesde,
        fechaHasta,
        dataGroup,
      ),
    ]);
    return { estacion, pluviometro, suelo };
  }

  // Datos entre fechas por dispositivo
  @Get('suelo/dispositivo/:id/:fechaDesde/:fechaHasta')
  public async getSueloPorDispositivoEntreFechas(
    @Param('id') id: string,
    @Param('fechaDesde') fechaDesde: string,
    @Param('fechaHasta') fechaHasta: string,
    @Query('dataGroup') dataGroup: 'raw' | 'hourly' | 'daily' | 'monthly',
  ) {
    return await this.service.getSueloPorDispositivoEntreFechas(
      id,
      dataGroup,
      fechaDesde,
      fechaHasta,
    );
  }

  // Datos ultimo dia por dispositivo
  @Get('suelo/dispositivo/:id')
  public async getSueloPorDispositivoUltimoDato(
    @Param('id') id: string,
    @Query('dataGroup') dataGroup: 'raw' | 'hourly' | 'daily' | 'monthly',
  ) {
    const { fechaDesde, fechaHasta } = HelperService.fechasUltimoDias(1);
    return await this.service.getSueloPorDispositivoEntreFechas(
      id,
      dataGroup,
      fechaDesde,
      fechaHasta,
    );
  }

  // Pronostico
  @Get('pronostico/cerca/:lat/:lng')
  public async getPronosticoMasCercano(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
  ) {
    return await this.service.getPronosticoMasCercano({ lat, lng });
  }

  @Get('meteoSource/:lat/:lng')
  public async getForecastMeteoSource(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
  ) {
    return await this.service.getForecastMeteoSource({ lat, lng });
  }

  @Get('meteoSource/current/:lat/:lng')
  public async getCurrentWeather(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
  ) {
    return await this.service.getCurrentWeatherMeteoSource({ lat, lng });
  }

  // semáforo
  @Get('semaforo/:lat/:lng')
  public async getSemaforo(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
  ): Promise<nivelPrediccion[]> {
    return await this.service.getNivelPrediccionPorUbicacion({ lat, lng });
  }
}
