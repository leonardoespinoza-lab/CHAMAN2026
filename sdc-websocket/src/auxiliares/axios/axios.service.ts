import { HttpService } from '@nestjs/axios';
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';

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
      if (error?.response) {
        // Respuesta de error de la API
        throw new HttpException(
          error?.response?.data?.message,
          error?.response?.status,
        );
      } else {
        // No hubo respusta de la API
        const msg = `Error en request ${error?.config?.method} ${error?.config?.url} ${error?.message}`;
        Logger.error(msg, 'AXIOS');
        throw new HttpException(error?.message, 500);
      }
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
      if (error?.response) {
        // Respuesta de error de la API
        throw new HttpException(
          error?.response?.data?.message,
          error?.response?.status,
        );
      } else {
        // No hubo respusta de la API
        const msg = `Error en request ${error?.config?.method} ${error?.config?.url} ${error?.message}`;
        Logger.error(msg, 'AXIOS');
        throw new HttpException(error?.message, 500);
      }
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
      if (error?.response) {
        // Respuesta de error de la API
        throw new HttpException(
          error?.response?.data?.message,
          error?.response?.status,
        );
      } else {
        // No hubo respusta de la API
        const msg = `Error en request ${error?.config?.method} ${error?.config?.url} ${error?.message}`;
        Logger.error(msg, 'AXIOS');
        throw new HttpException(error?.message, 500);
      }
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
      if (error?.response) {
        // Respuesta de error de la API
        throw new HttpException(
          error?.response?.data?.message,
          error?.response?.status,
        );
      } else {
        // No hubo respusta de la API
        const msg = `Error en request ${error?.config?.method} ${error?.config?.url} ${error?.message}`;
        Logger.error(msg, 'AXIOS');
        throw new HttpException(error?.message, 500);
      }
    }
  }
}
