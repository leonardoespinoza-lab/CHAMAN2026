import { HttpService } from '@nestjs/axios';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';
import { INTERNAL_HTTP_TIMEOUT_MS } from '../../env';

@Injectable()
export class AxiosService {
  constructor(private httpService: HttpService) {}

  public async GET<T>(
    url: string,
    options?: AxiosRequestConfig<any>,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<T>(url, options),
      );
      return response?.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  public async POST<T>(
    url: string,
    data: Record<string, any>,
    options?: AxiosRequestConfig<any>,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<T>(url, data, options),
      );
      return response?.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  public async PUT<T>(
    url: string,
    data: Record<string, any>,
    options?: AxiosRequestConfig<any>,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.put<T>(url, data, options),
      );
      return response?.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  public async DELETE<T>(
    url: string,
    options?: AxiosRequestConfig<any>,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.delete<T>(url, options),
      );
      return response?.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: any): never {
    const config = error?.config || error?.toJSON?.()?.config || {};
    const method = String(config?.method || 'request').toUpperCase();
    const url = String(config?.url || 'servicio interno');
    const timeout = Number(config?.timeout) || INTERNAL_HTTP_TIMEOUT_MS;

    if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
      const publicMessage =
        `El servicio interno no respondió dentro del tiempo máximo ` +
        `configurado (${timeout} ms).`;
      Logger.error(
        `Timeout en request ${method} ${url} después de ${timeout} ms`,
        'AXIOS',
      );
      throw new HttpException(publicMessage, HttpStatus.GATEWAY_TIMEOUT);
    }

    const apiMessage = error?.response?.data?.message;
    const responseStatus = Number(error?.response?.status);
    if (apiMessage && Number.isInteger(responseStatus)) {
      Logger.error(
        `Error ${responseStatus} en request ${method} ${url} | ${apiMessage}`,
        'AXIOS',
      );
      throw new HttpException(apiMessage, responseStatus);
    }

    const status = Number(error?.status);
    const message = String(error?.message || 'Falló la comunicación interna.');
    Logger.error(
      `Error ${Number.isInteger(status) ? status : 'sin estado'} en request ${method} ${url} | ${message}`,
      'AXIOS',
    );
    throw new HttpException(
      message,
      Number.isInteger(status) && status >= 400 && status <= 599
        ? status
        : HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
