import { AgroclimaService } from './service';

describe('AgroclimaService - alerta conservadora de granizo', () => {
  const service = new AgroclimaService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  const riesgo = (
    fechaCritica: string,
    overrides: Record<string, any> = {},
  ) => ({
    tipo: 'granizo',
    aplica: true,
    nivel: 'alto',
    posibilidadPct: 71,
    titulo: 'Vigilancia convectiva por granizo',
    lectura: 'Senal severa',
    recomendacion: 'Validar',
    fechaCritica,
    diasRiesgo: 1,
    evidencia: [],
    calidadDatos: {
      nivel: 'media',
      score: 64,
      fuente: 'Open-Meteo',
      detalle: 'Proxies',
    },
    serie: [
      {
        fecha: fechaCritica,
        nivel: 'alto',
        posibilidadPct: 71,
        weatherCode: 99,
        cape: 2200,
        lluvia: 12,
        showers: 12,
        probabilidadLluvia: 65,
        rafagaViento: 60,
      },
    ],
    ...overrides,
  });

  it('emite solo una senal fuerte convergente dentro de 72 horas', () => {
    expect(
      (service as any).debeEmitirAlertaGranizo(
        riesgo('2026-07-16'),
        '2026-07-13T15:00:00.000Z',
      ),
    ).toBe(true);
  });

  it('no alarma por una senal fuerte a mas de 72 horas', () => {
    expect(
      (service as any).debeEmitirAlertaGranizo(
        riesgo('2026-07-17'),
        '2026-07-13T15:00:00.000Z',
      ),
    ).toBe(false);
  });

  it('no alarma si falta codigo de granizo o convergencia excepcional', () => {
    const sinConfirmacion = riesgo('2026-07-15');
    sinConfirmacion.serie[0].weatherCode = 95;
    sinConfirmacion.serie[0].cape = 2200;

    expect(
      (service as any).debeEmitirAlertaGranizo(
        sinConfirmacion,
        '2026-07-13T15:00:00.000Z',
      ),
    ).toBe(false);
  });

  it('acepta una convergencia excepcional sin codigo explicito de granizo', () => {
    const excepcional = riesgo('2026-07-15');
    excepcional.serie[0].weatherCode = 95;
    excepcional.serie[0].cape = 2600;

    expect(
      (service as any).debeEmitirAlertaGranizo(
        excepcional,
        '2026-07-13T15:00:00.000Z',
      ),
    ).toBe(true);
  });
});
