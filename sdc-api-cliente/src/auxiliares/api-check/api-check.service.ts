import { Injectable, Logger } from '@nestjs/common';
import { AxiosService } from '../axios/axios.service';
import { API_AUTH, API_CLIMA, API_DATOS, API_PREDICCIONES } from 'src/env';

@Injectable()
export class ApiCheckService {
  constructor(private axios: AxiosService) {}
  private logger = new Logger(ApiCheckService.name);

  private getHealthCandidates(apiBase: string): string[] {
    const base = apiBase.replace(/\/+$/, '');
    try {
      const parsed = new URL(base);
      if (parsed.pathname && parsed.pathname !== '/') {
        return Array.from(new Set([`${parsed.origin}/health`, `${base}/health`]));
      }
    } catch (error) {
      this.logger.warn(`No se pudo normalizar health check para ${apiBase}`);
    }
    return [`${base}/health`];
  }

  private async checkApi(name: string, apiBase: string): Promise<boolean> {
    for (const healthUrl of this.getHealthCandidates(apiBase)) {
      try {
        await this.axios.GET(healthUrl);
        this.logger.log(`${name}: ${apiBase} [OK!]`);
        return true;
      } catch (error) {
        this.logger.warn(`${name}: health sin respuesta en ${healthUrl}`);
      }
    }
    this.logger.error(`${name}: ${apiBase} [ERROR!]`);
    return false;
  }

  async checkApis(): Promise<boolean> {
    let ok = true;
    // Checkeo de las API en los ENVS de cada microservicio

    if (API_DATOS) {
      ok = (await this.checkApi('API_DATOS', API_DATOS)) && ok;
    }

    if (API_AUTH) {
      ok = (await this.checkApi('API_AUTH', API_AUTH)) && ok;
    }

    if (API_CLIMA) {
      ok = (await this.checkApi('API_CLIMA', API_CLIMA)) && ok;
    }

    if (API_PREDICCIONES) {
      ok = (await this.checkApi('API_PREDICCIONES', API_PREDICCIONES)) && ok;
    }

    return ok;
  }
}
