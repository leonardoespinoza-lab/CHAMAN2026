import {
  evaluarRoyaAmarillaElJarroudi2017,
  IHoraRoyaAmarilla,
} from 'modelos/src';

function ventana(
  favorables: Set<number> = new Set(),
  modificar?: (hora: IHoraRoyaAmarilla, indice: number) => void,
): IHoraRoyaAmarilla[] {
  const inicio = new Date('2026-07-01T00:00:00Z').getTime();
  return Array.from({ length: 240 }, (_, indice) => {
    const hora: IHoraRoyaAmarilla = {
      fecha: new Date(inicio + indice * 60 * 60 * 1000).toISOString(),
      temperatura: favorables.has(indice) ? 10 : 20,
      humedadRelativa: favorables.has(indice) ? 95 : 70,
      lluviaMm: favorables.has(indice) ? 0.1 : 0,
    };
    modificar?.(hora, indice);
    return hora;
  });
}

describe('modelo horario experimental de roya amarilla', () => {
  it.each([
    ['T=4', { temperatura: 4, humedadRelativa: 95, lluviaMm: 0.1 }],
    ['T=16', { temperatura: 16, humedadRelativa: 95, lluviaMm: 0.1 }],
    ['HR=92', { temperatura: 10, humedadRelativa: 92, lluviaMm: 0.1 }],
  ])('respeta el borde estricto %s', (_nombre, valores) => {
    const horas = ventana(new Set([100, 101, 102, 103]), (hora, indice) => {
      if (indice >= 100 && indice <= 103) Object.assign(hora, valores);
    });
    expect(evaluarRoyaAmarillaElJarroudi2017(horas).horasFavorables).toBe(0);
  });

  it('acepta lluvia igual a 0,1 mm y exige cuatro horas consecutivas', () => {
    const tres = evaluarRoyaAmarillaElJarroudi2017(
      ventana(new Set([100, 101, 102])),
    );
    const cuatro = evaluarRoyaAmarillaElJarroudi2017(
      ventana(new Set([100, 101, 102, 103])),
    );
    expect(tres.horasFavorables).toBe(0);
    expect(cuatro.horasFavorables).toBe(4);
    expect(cuatro.rachasFavorables).toBe(1);
  });

  it('clasifica 36/240 h como oportunidad fuerte y 48/240 como muy fuerte', () => {
    const fuerte = evaluarRoyaAmarillaElJarroudi2017(
      ventana(new Set(Array.from({ length: 36 }, (_, indice) => indice + 100))),
    );
    const muyFuerte = evaluarRoyaAmarillaElJarroudi2017(
      ventana(new Set(Array.from({ length: 48 }, (_, indice) => indice + 100))),
    );
    expect(fuerte.frecuenciaAmbientalPct).toBe(15);
    expect(fuerte.nivel).toBe('fuerte');
    expect(muyFuerte.frecuenciaAmbientalPct).toBe(20);
    expect(muyFuerte.nivel).toBe('muy_fuerte');
  });

  it('un dato horario faltante corta la racha', () => {
    const horas = ventana(new Set([100, 101, 102, 103, 104])).filter(
      (_hora, indice) => indice !== 102,
    );
    const resultado = evaluarRoyaAmarillaElJarroudi2017(horas);
    expect(resultado.calculable).toBe(true);
    expect(resultado.horasFavorables).toBe(0);
  });

  it('con menos del 90% de cobertura queda sin datos', () => {
    const resultado = evaluarRoyaAmarillaElJarroudi2017(
      ventana().slice(0, 215),
    );
    expect(resultado.cobertura).toBeLessThan(0.9);
    expect(resultado.calculable).toBe(false);
    expect(resultado.nivel).toBe('sin_datos');
  });
});
