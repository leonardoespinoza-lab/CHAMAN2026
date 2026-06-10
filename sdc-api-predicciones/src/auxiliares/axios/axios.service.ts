import { HttpService } from '@nestjs/axios';
import { HttpException, Injectable } from '@nestjs/common';
import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import { LogService } from '../logsService/service';

@Injectable()
export class AxiosService {
  private logger = new LogService(AxiosService.name);

  constructor(private httpService: HttpService) {}

  private handleError(error: any, url: string, method: string) {
    if (error?.response) {
      // Respuesta de error de la API
      throw new HttpException(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.response?.data,
        error?.response?.status,
      );
    } else if (error?.request) {
      // No hubo respuesta de la API
      this.logger.error(`No hubo respuesta de la API en ${method} ${url}`);
      throw new HttpException(error?.request?.data, error?.request?.status);
    } else {
      // Error desconocido
      this.logger.error(`Unhandled Error en ${method} ${url}`);
      console.error(error);
      throw new HttpException(error, 500);
    }
  }

  //

  public async GET<T>(url: string, options?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<T>(url, options),
      );
      return response?.data;
    } catch (error) {
      this.handleError(error, url, 'GET');
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
      this.handleError(error, url, 'POST');
    }
  }

  public async POST_FULL<T>(
    url: string,
    data: Record<string, any>,
    options?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T, any>> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<T>(url, data, options),
      );
      return response;
    } catch (error) {
      this.handleError(error, url, 'POST');
    }
  }

  public async PUT<T>(
    url: string,
    data: Record<string, any>,
    options?: AxiosRequestConfig,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.put<T>(url, data, options),
      );
      return response?.data;
    } catch (error) {
      this.handleError(error, url, 'PUT');
    }
  }

  public async DELETE<T>(
    url: string,
    options?: AxiosRequestConfig,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.delete<T>(url, options),
      );
      return response?.data;
    } catch (error) {
      this.handleError(error, url, 'DELETE');
    }
  }
}
