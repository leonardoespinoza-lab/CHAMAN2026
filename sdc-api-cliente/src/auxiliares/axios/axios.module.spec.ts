import { Test } from '@nestjs/testing';
import { INTERNAL_HTTP_TIMEOUT_MS } from '../../env';
import { AxiosModule } from './axios.module';
import { AxiosService } from './axios.service';

describe('AxiosModule', () => {
  it('aplica el timeout global a la instancia HTTP compartida', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AxiosModule],
    }).compile();

    const service = moduleRef.get(AxiosService) as any;
    expect(service.httpService.axiosRef.defaults.timeout).toBe(
      INTERNAL_HTTP_TIMEOUT_MS,
    );

    await moduleRef.close();
  });
});
