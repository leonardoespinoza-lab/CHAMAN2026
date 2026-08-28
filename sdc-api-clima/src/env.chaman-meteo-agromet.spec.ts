import {
  CHAMAN_METEO_AGROMET_BRIDGE_ENABLED,
  CHAMAN_METEO_AGROMET_RECENT_OPEN_METEO_DAYS,
  resolveIdentifierAllowlist,
} from './env';

describe('Chaman-Meteo agromet bridge environment', () => {
  it('queda apagado por defecto y reserva cinco dias recientes', () => {
    expect(CHAMAN_METEO_AGROMET_BRIDGE_ENABLED).toBe(false);
    expect(CHAMAN_METEO_AGROMET_RECENT_OPEN_METEO_DAYS).toBe(5);
  });

  it('normaliza, deduplica y elimina entradas vacias de allowlists', () => {
    expect(resolveIdentifierAllowlist(' ABC,abc,  DEF ,, def ')).toEqual([
      'abc',
      'def',
    ]);
  });
});
