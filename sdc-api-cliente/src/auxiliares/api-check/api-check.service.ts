import { Injectable, Logger } from '@nestjs/common';
import { AxiosService } from '../axios/axios.service';
import { API_AUTH, API_CLIMA, API_DATOS, API_PREDICCIONES } from 'src/env';

@Injectable()
export class ApiCheckService {
  constructor(private axios: AxiosService) {}
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

    if (API_AUTH) {
      try {
        await this.axios.GET(`${API_AUTH}/api`);
        this.logger.log(`API_AUTH: ${API_AUTH} [OK!]`);
      } catch (error) {
        ok = false;
        this.logger.error(`API_AUTH: ${API_AUTH} [ERROR!]`);
      }
    }

    if (API_CLIMA) {
      try {
        await this.axios.GET(`${API_CLIMA}/api`);
        this.logger.log(`API_CLIMA: ${API_CLIMA} [OK!]`);
      } catch (error) {
        ok = false;
        this.logger.error(`API_CLIMA: ${API_CLIMA} [ERROR!]`);
      }
    }

    if (API_PREDICCIONES) {
      try {
        await this.axios.GET(`${API_PREDICCIONES}/api`);
        this.logger.log(`API_PREDICCIONES: ${API_PREDICCIONES} [OK!]`);
      } catch (error) {
        ok = false;
        this.logger.error(`API_PREDICCIONES: ${API_PREDICCIONES} [ERROR!]`);
      }
    }

    return ok;
  }
}
