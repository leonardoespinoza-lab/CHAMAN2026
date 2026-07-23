import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AxiosService } from './axios.service';

describe('AxiosService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('devuelve los datos de una respuesta interna exitosa', async () => {
    const httpService = {
      get: jest.fn().mockReturnValue(of({ data: { ok: true } })),
    };
    const service = new AxiosService(httpService as any);

    await expect(service.GET('http://datos/health')).resolves.toEqual({
      ok: true,
    });
  });

  it.each(['ECONNABORTED', 'ETIMEDOUT'])(
    'convierte %s en un 504 explicito con el timeout efectivo',
    async (code) => {
      const error = {
        code,
        message: 'timeout excedido',
        config: {
          method: 'get',
          url: 'http://datos/siembras/1',
          timeout: 12_500,
        },
      };
      const httpService = {
        get: jest.fn().mockReturnValue(throwError(() => error)),
      };
      const logger = jest.spyOn(Logger, 'error').mockImplementation();
      const service = new AxiosService(httpService as any);

      let thrown: HttpException | undefined;
      try {
        await service.GET('http://datos/siembras/1');
      } catch (caught) {
        thrown = caught as HttpException;
      }

      expect(thrown).toBeInstanceOf(HttpException);
      expect(thrown?.getStatus()).toBe(HttpStatus.GATEWAY_TIMEOUT);
      expect(thrown?.getResponse()).toBe(
        'El servicio interno no respondió dentro del tiempo máximo configurado (12500 ms).',
      );
      expect(logger).toHaveBeenCalledWith(
        'Timeout en request GET http://datos/siembras/1 después de 12500 ms',
        'AXIOS',
      );
    },
  );

  it('preserva el estado y el mensaje funcional devueltos por el servicio', async () => {
    const error = {
      message: 'Request failed',
      config: { method: 'post', url: 'http://datos/lotes' },
      response: {
        status: HttpStatus.CONFLICT,
        data: { message: 'El lote ya existe.' },
      },
    };
    const httpService = {
      post: jest.fn().mockReturnValue(throwError(() => error)),
    };
    jest.spyOn(Logger, 'error').mockImplementation();
    const service = new AxiosService(httpService as any);

    await expect(
      service.POST('http://datos/lotes', { nombre: 'Lote 1' }),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: 'El lote ya existe.',
    });
  });

  it('maneja errores no Axios sin lanzar un TypeError secundario', async () => {
    const httpService = {
      delete: jest
        .fn()
        .mockReturnValue(throwError(() => new Error('Conexion interrumpida'))),
    };
    jest.spyOn(Logger, 'error').mockImplementation();
    const service = new AxiosService(httpService as any);

    await expect(
      service.DELETE('http://datos/recurso/1'),
    ).rejects.toMatchObject({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      response: 'Conexion interrumpida',
    });
  });
});
