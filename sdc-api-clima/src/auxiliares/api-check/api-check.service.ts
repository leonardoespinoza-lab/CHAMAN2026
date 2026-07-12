import { Injectable, Logger } from '@nestjs/common';
import { AxiosService } from '../axios/axios.service';
import {
  API_DATOS,
  API_FIELD_CLIMATE,
  API_METEO_SOURCE,
  METEOBLUE_API_KEY,
  FIELD_CLIMATE_PASS,
  FIELD_CLIMATE_USERS,
  METEO_SOURCE_KEY,
  OMIXON_KEY,
  API_OMIXON,
  API_OPEN_WEATHER,
  OPEN_WEATHER_KEY,
} from 'src/env';
import { FieldClimateService } from 'src/entidades/fieldClimate/service';
import { OpenWeatherService } from 'src/entidades/openWeather/service';
import { MeteoSourceService } from 'src/entidades/meteoSource/service';
import { OmixomService } from 'src/entidades/omixom/service';
import { MeteoblueService } from 'src/entidades/meteoblue/service';

@Injectable()
export class ApiCheckService {
  constructor(
    private axios: AxiosService,
    private fieldClimate: FieldClimateService,
    private openWeather: OpenWeatherService,
    private meteoSource: MeteoSourceService,
    private meteoblue: MeteoblueService,
    private omixom: OmixomService,
  ) {}
  private logger = new Logger(ApiCheckService.name);
  async checkApis(): Promise<boolean> {
    let ok = true;
    // Checkeo de las API en los ENVS de cada microservicio

    if (API_DATOS) {
      try {
        await this.axios.GET(`${API_DATOS}/health`);
        this.logger.log(`API_DATOS: ${API_DATOS} [OK!]`);
      } catch (error) {
        ok = false;
        this.logger.error(`API_DATOS: ${API_DATOS} [ERROR!]`);
      }
    }

    if (
      API_FIELD_CLIMATE &&
      FIELD_CLIMATE_USERS.length &&
      FIELD_CLIMATE_PASS.length
    ) {
      try {
        await this.fieldClimate.checkApi();
        this.logger.log(`API_FIELD_CLIMATE: ${API_FIELD_CLIMATE} [OK!]`);
      } catch (error) {
        ok = false;
        this.logger.error(`API_FIELD_CLIMATE: ${API_FIELD_CLIMATE} [ERROR!]`);
      }
    } else {
      this.logger.warn(
        'API_FIELD_CLIMATE sin credenciales operativas; chequeo omitido.',
      );
    }

    if (API_OPEN_WEATHER && OPEN_WEATHER_KEY) {
      try {
        await this.openWeather.checkApi();
        this.logger.log(`API_OPEN_WEATHER: ${API_OPEN_WEATHER} [OK!]`);
      } catch (error) {
        ok = false;
        this.logger.error(`API_OPEN_WEATHER: ${API_OPEN_WEATHER} [ERROR!]`);
      }
    } else {
      this.logger.warn('OPEN_WEATHER_KEY no configurada; chequeo omitido.');
    }

    if (API_METEO_SOURCE && METEO_SOURCE_KEY) {
      try {
        await this.meteoSource.checkApi();
        this.logger.log(`API_METEO_SOURCE: ${API_METEO_SOURCE} [OK!]`);
      } catch (error) {
        ok = false;
        this.logger.error(`API_METEO_SOURCE: ${API_METEO_SOURCE} [ERROR!]`);
      }
    } else {
      this.logger.warn('METEO_SOURCE_KEY no configurada; chequeo omitido.');
    }

    if (METEOBLUE_API_KEY) {
      try {
        await this.meteoblue.checkApi();
        this.logger.log(`METEOBLUE_API_KEY: configurada [OK!]`);
      } catch (error) {
        ok = false;
        this.logger.error(`METEOBLUE_API_KEY: configurada [ERROR!]`);
      }
    } else {
      this.logger.warn(
        'METEOBLUE_API_KEY no configurada; Meteoblue queda como fuente opcional desactivada.',
      );
    }

    if (API_OMIXON && OMIXON_KEY) {
      try {
        await this.omixom.getEstaciones();
        this.logger.log(`API_OMIXON: ${API_OMIXON} [OK!]`);
      } catch (error) {
        ok = false;
        this.logger.error(`API_OMIXON: ${API_OMIXON} [ERROR!]`);
      }
    } else {
      this.logger.warn('OMIXON_KEY no configurada; chequeo omitido.');
    }

    return ok;
  }
}
