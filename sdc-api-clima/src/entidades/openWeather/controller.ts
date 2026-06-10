import { Controller, Get, Param } from '@nestjs/common';
import { OpenWeatherService } from './service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Open Weather')
@Controller('openWeather')
export class FieldClimateController {
  constructor(private service: OpenWeatherService) {}

  @Get('estacion/cerca/:lat/:lng/:fechaDesde/:fechaHasta')
  public async getForecast(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
  ) {
    return await this.service.getForecast(lat, lng);
  }
}
