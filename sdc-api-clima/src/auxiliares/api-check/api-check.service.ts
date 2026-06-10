import { Injectable, Logger } from '@nestjs/common';
import { AxiosService } from '../axios/axios.service';
import {
  API_DATOS,
  API_FIELD_CLIMATE,
  API_HORATECH,
  API_METEO_SOURCE,
  API_OMIXON,
  API_OPEN_WEATHER,
} from 'src/env';
import { FieldClimateService } from 'src/entidades/fieldClimate/service';
import { OpenWeatherService } from 'src/entidades/openWeather/service';
import { MeteoSourceService } from 'src/entidades/meteoSource/service';
import { OmixomService } from 'src/entidades/omixom/service';
import { HoratechService } from 'src/entidades/horatech/service';

@Injectable()
export class ApiCheckService {
  constructor(
    private axios: AxiosService,
    private fieldClimate: FieldClimateService,
    private openWeather: OpenWeatherService,
    private meteoSource: MeteoSourceService,
    private omixom: OmixomService,
    private horatech: HoratechService,
  ) {}
  private logger = new Logger(ApiCheckService.name);
  async checkApis(): Promise<boolean> {
    let ok = true;
    // Checkeo de las API en los ENVS de cada microservicio

    if (API_DATOS) {
      try {
        await this.axios.GET(`${API_DATOS}/api`);
        this.logger.log(`API_DATOS: ${API_DATOS} [OK!]`);
      } catch (error) {
        ok = false;
        this.logger.error(`API_DATOS: ${API_DATOS} [ERROR!]`);
      }
    }

    if (API_FIELD_CLIMATE) {
      try {
        await this.fieldClimate.checkApi();
        this.logger.log(`API_FIELD_CLIMATE: ${API_FIELD_CLIMATE} [OK!]`);
      } catch (error) {
        ok = false;
        this.logger.error(`API_FIELD_CLIMATE: ${API_FIELD_CLIMATE} [ERROR!]`);
      }
    }

    if (API_OPEN_WEATHER) {
      try {
        await this.openWeather.checkApi();
        this.logger.log(`API_OPEN_WEATHER: ${API_OPEN_WEATHER} [OK!]`);
      } catch (error) {
        ok = false;
        this.logger.error(`API_OPEN_WEATHER: ${API_OPEN_WEATHER} [ERROR!]`);
      }
    }

    if (API_METEO_SOURCE) {
      try {
        await this.meteoSource.checkApi();
        this.logger.log(`API_METEO_SOURCE: ${API_METEO_SOURCE} [OK!]`);
      } catch (error) {
        ok = false;
        this.logger.error(`API_METEO_SOURCE: ${API_METEO_SOURCE} [ERROR!]`);
      }
    }

    if (API_OMIXON) {
      try {
        await this.omixom.getEstaciones();
        this.logger.log(`API_OMIXON: ${API_OMIXON} [OK!]`);
      } catch (error) {
        ok = false;
        this.logger.error(`API_OMIXON: ${API_OMIXON} [ERROR!]`);
      }
    }

    if (API_HORATECH) {
      try {
        await this.horatech.checkApi();
        this.logger.log(`API_HORATECH: ${API_HORATECH} [OK!]`);
      } catch (error) {
        ok = false;
        this.logger.error(`API_HORATECH: ${API_HORATECH} [ERROR!]`);
      }
    }

    return ok;
  }
}
