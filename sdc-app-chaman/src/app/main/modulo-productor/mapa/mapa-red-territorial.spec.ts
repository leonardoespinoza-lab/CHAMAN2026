import { puedeVerRedTerritorial } from './mapa.component';

describe('visibilidad de la red territorial', () => {
  it('la muestra para niveles supervisores', () => {
    expect(puedeVerRedTerritorial('Admin')).toBe(true);
    expect(puedeVerRedTerritorial('Quimica')).toBe(true);
    expect(puedeVerRedTerritorial('Distribuidor')).toBe(true);
    expect(puedeVerRedTerritorial('Asesor')).toBe(true);
  });

  it('la oculta para niveles operativos', () => {
    expect(puedeVerRedTerritorial('Productor')).toBe(false);
    expect(puedeVerRedTerritorial('Establecimiento')).toBe(false);
  });
});
