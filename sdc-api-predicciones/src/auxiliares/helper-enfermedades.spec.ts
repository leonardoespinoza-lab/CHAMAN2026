import { HelperService } from './helper';

describe('HelperService para enfermedades', () => {
  it('incluye el día de aplicación en la ventana de una fumigación', () => {
    const fechas = HelperService.fechasFumigadas([
      {
        fechaFumigacion: '2026-07-10T15:00:00.000Z',
        duracion: 2,
      },
    ]);
    expect(fechas).toEqual([
      '2026-07-10T03:00:00.000Z',
      '2026-07-11T03:00:00.000Z',
    ]);
  });
});
