import { HttpService } from '@nestjs/axios';
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AxiosService {
  constructor(private httpService: HttpService) {}

  private handleError(error: any) {
    if (error?.response) {
      // Respuesta de error de la API
      throw new HttpException(
        error?.response?.data?.message,
        error?.response?.status,
      );
    } else if (error?.request) {
      // No hubo respusta de la API
      Logger.error('No hubo respusta de la API', 'AXIOS');
      throw new HttpException(error?.request?.data, error?.request?.status);
    } else {
      // Error desconocido
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
      Logger.error(`Error en GET ${url}`, 'AXIOS');
      this.handleError(error);
    }
  }

  public async POST<T>(
    url: string,
    data: Record<string, any>,
    options?: AxiosRequestConfig,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<T>(url, data, options),
      );
      return response?.data;
    } catch (error) {
      Logger.error(`Error en POST ${url}`, 'AXIOS');
      this.handleError(error);
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
      Logger.error(`Error en PUT ${url}`, 'AXIOS');
      this.handleError(error);
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
      Logger.error(`Error en DELETE ${url}`, 'AXIOS');
      this.handleError(error);
    }
  }
}
