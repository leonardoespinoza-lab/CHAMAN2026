import { ClimaV2Repository } from './repository';

describe('ClimaV2Repository - suelo', () => {
  it('solicita perfil horario para no consumir promedios diarios', async () => {
    const axios = { GET: jest.fn().mockResolvedValue([]) };
    const repository = new ClimaV2Repository(axios as any);

    await repository.getSuelo(
      'sentek-1',
      '2026-08-01T00:00:00.000Z',
      '2026-08-15T00:00:00.000Z',
      'hourly',
    );

    expect(axios.GET).toHaveBeenCalledWith(
      expect.stringContaining('/climav2/suelo/sentek-1/'),
      { params: { agrupacion: 'hourly' } },
    );
  });
});
