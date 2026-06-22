import { Body, Controller, Get, Logger, Param, Post } from '@nestjs/common';
import { FieldClimateService } from './service';
import { ApiTags } from '@nestjs/swagger';
import { HelperService } from '../../auxiliares/helper';

@ApiTags('Field Climate')
@Controller('fieldclimate')
export class FieldClimateController {
  private logger = new Logger(FieldClimateController.name);

  constructor(private service: FieldClimateService) {}

  @Post('integracion/stations')
  public async descubrirCentrales(
    @Body() body: { username: string; password: string },
  ) {
    const stations = await this.service.getStations(body.username, body.password);
    return stations.map((station) => ({
      name: station.name,
      info: station.info,
      dates: station.dates,
      position: station.position,
      meta: station.meta,
      rights: station.rights,
    }));
  }

  @Post('integracion/stations/:id')
  public async obtenerCentral(
    @Param('id') id: string,
    @Body() body: { username: string; password: string },
  ) {
    return await this.service.getStation(id, body.username, body.password);
  }

  @Post('integracion/stations/:id/sensors')
  public async obtenerSensoresCentral(
    @Param('id') id: string,
    @Body() body: { username: string; password: string },
  ) {
    return await this.service.getStationSensors(id, body.username, body.password);
  }

  @Post('integracion/stations/:id/last')
  public async obtenerUltimosDatos(
    @Param('id') id: string,
    @Body()
    body: {
      username: string;
      password: string;
      dataGroup?: 'raw' | 'hourly' | 'daily' | 'monthly';
      timePeriod?: string;
    },
  ) {
    return await this.service.getLastData(
      id,
      body.dataGroup || 'hourly',
      body.timePeriod || '24h',
      body.username,
      body.password,
    );
  }

  @Post('integracion/stations/:id/forecast')
  public async obtenerPronosticoCentral(
    @Param('id') id: string,
    @Body() body: { username: string; password: string },
  ) {
    return await this.service.getForecast(id, body.username, body.password);
  }

  // Datos entre fechas

  @Get('estacion/cerca/:lat/:lng/:fechaDesde/:fechaHasta')
  public async getEstacionMasCercanaEntreFechas(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
    @Param('fechaDesde') fechaDesde: string,
    @Param('fechaHasta') fechaHasta: string,
  ) {
    return await this.service.getEstacionMasCercanaEntreFechas(
      { lat, lng },
      fechaDesde,
      fechaHasta,
    );
  }

  @Get('pluviometro/cerca/:lat/:lng/:fechaDesde/:fechaHasta')
  public async getPluviometroMasCercanoEntreFechas(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
    @Param('fechaDesde') fechaDesde: string,
    @Param('fechaHasta') fechaHasta: string,
  ) {
    return await this.service.getPluviometroMasCercanoEntreFechas(
      { lat, lng },
      fechaDesde,
      fechaHasta,
    );
  }

  @Get('suelo/cerca/:lat/:lng/:fechaDesde/:fechaHasta')
  public async getSueloMasCercanoEntreFechas(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
    @Param('fechaDesde') fechaDesde: string,
    @Param('fechaHasta') fechaHasta: string,
  ) {
    return await this.service.getSueloMasCercanoEntreFechas(
      { lat, lng },
      fechaDesde,
      fechaHasta,
    );
  }

  @Get('clima/cerca/:lat/:lng/:fechaDesde/:fechaHasta')
  public async getClimaMasCercanoEntreFechas(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
    @Param('fechaDesde') fechaDesde: string,
    @Param('fechaHasta') fechaHasta: string,
  ) {
    const [estacion, pluviometro, suelo] = await Promise.all([
      this.service.getEstacionMasCercanaEntreFechas(
        { lat, lng },
        fechaDesde,
        fechaHasta,
      ),
      this.service.getPluviometroMasCercanoEntreFechas(
        { lat, lng },
        fechaDesde,
        fechaHasta,
      ),
      this.service.getSueloMasCercanoEntreFechas(
        { lat, lng },
        fechaDesde,
        fechaHasta,
      ),
    ]);
    return { estacion, pluviometro, suelo };
  }

  // Datos último día

  @Get('estacion/cerca/:lat/:lng')
  public async getEstacionMasCercanaUltimoDato(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
  ) {
    const { fechaDesde, fechaHasta } = HelperService.fechasUltimoDias(1);
    return await this.service.getEstacionMasCercanaEntreFechas(
      { lat, lng },
      fechaDesde,
      fechaHasta,
    );
  }

  @Get('pluviometro/cerca/:lat/:lng')
  public async getPluviometroMasCercanoUltimoDato(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
  ) {
    const { fechaDesde, fechaHasta } = HelperService.fechasUltimoDias(1);
    return await this.service.getPluviometroMasCercanoEntreFechas(
      { lat, lng },
      fechaDesde,
      fechaHasta,
    );
  }

  @Get('suelo/cerca/:lat/:lng')
  public async getSueloMasCercanoUltimoDato(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
  ) {
    const { fechaDesde, fechaHasta } = HelperService.fechasUltimoDias(1);
    return await this.service.getSueloMasCercanoEntreFechas(
      { lat, lng },
      fechaDesde,
      fechaHasta,
    );
  }

  @Get('clima/cerca/:lat/:lng')
  public async getClimaMasCercanoUltimoDato(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
  ) {
    const { fechaDesde, fechaHasta } = HelperService.fechasUltimoDias(2);
    const [estacion, pluviometro, suelo] = await Promise.all([
      this.service.getEstacionMasCercanaEntreFechas(
        { lat, lng },
        fechaDesde,
        fechaHasta,
      ),
      this.service.getPluviometroMasCercanoEntreFechas(
        { lat, lng },
        fechaDesde,
        fechaHasta,
      ),
      this.service.getSueloMasCercanoEntreFechas(
        { lat, lng },
        fechaDesde,
        fechaHasta,
      ),
    ]);
    return { estacion, pluviometro, suelo };
  }
}
