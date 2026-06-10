import { Controller, Get, Logger, Param } from '@nestjs/common';
import { FieldClimateService } from './service';
import { ApiTags } from '@nestjs/swagger';
import { HelperService } from '../../auxiliares/helper';

@ApiTags('Field Climate')
@Controller('fieldclimate')
export class FieldClimateController {
  private logger = new Logger(FieldClimateController.name);

  constructor(private service: FieldClimateService) {}

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
