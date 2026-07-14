import { Injectable, Logger } from '@nestjs/common';
import { AxiosService } from '../axios/axios.service';
import { API_CLIMA, API_DATOS, API_PREDICCIONES } from '../../env';

export function buildHealthUrl(apiUrl: string): string {
  const normalized = /^https?:\/\//i.test(apiUrl)
    ? apiUrl
    : `http://${apiUrl}`;

  return new URL('/health', normalized).toString();
}

@Injectable()
export class ApiCheckService {
  constructor(private axios: AxiosService) {}
  private logger = new Logger(ApiCheckService.name);
  async checkApis(): Promise<void> {
    // Checkeo de las API en los ENVS de cada microservicio
    if (API_PREDICCIONES) {
      try {
        await this.axios.GET(buildHealthUrl(API_PREDICCIONES));
        this.logger.log(`API_PREDICCIONES: ${API_PREDICCIONES} [OK!]`);
      } catch (error) {
        this.logger.error(`API_PREDICCIONES: ${API_PREDICCIONES} [ERROR!]`);
        this.logger.error(error);
      }
    }

    if (API_DATOS) {
      try {
        await this.axios.GET(buildHealthUrl(API_DATOS));
        this.logger.log(`API_DATOS: ${API_DATOS} [OK!]`);
      } catch (error) {
        this.logger.error(`API_DATOS: ${API_DATOS} [ERROR!]`);
        this.logger.error(error);
      }
    }

    if (API_CLIMA) {
      try {
        await this.axios.GET(buildHealthUrl(API_CLIMA));
        this.logger.log(`API_CLIMA: ${API_CLIMA} [OK!]`);
      } catch (error) {
        this.logger.error(`API_CLIMA: ${API_CLIMA} [ERROR!]`);
        this.logger.error(error);
      }
    }
  }
}
