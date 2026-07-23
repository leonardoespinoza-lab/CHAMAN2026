import { HttpException, HttpStatus } from '@nestjs/common';
import { throwError } from 'rxjs';
import { AxiosService } from './axios.service';

describe('AxiosService Auth -> Datos', () => {
  it.each(['ECONNABORTED', 'ETIMEDOUT'])(
    'convierte el timeout %s en servicio no disponible',
    async (code) => {
      const error = Object.assign(new Error('timeout'), { code });
      const http = {
        get: jest.fn().mockReturnValue(throwError(() => error)),
      };
      const service = new AxiosService(http as any);

      let caught: HttpException | undefined;
      try {
        await service.GET('http://datos/usuarios/usuario/login/prueba');
      } catch (requestError) {
        caught = requestError as HttpException;
      }

      expect(caught).toBeInstanceOf(HttpException);
      expect(caught?.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    },
  );
});
