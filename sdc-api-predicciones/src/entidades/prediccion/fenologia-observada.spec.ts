import {
  aplicarEtapaFenologicaObservada,
  resolverEtapaFenologicaObservada,
} from './fenologia-observada';

describe('fenologia observada', () => {
  const siembra = {
    fechaSiembra: '2026-05-01T03:00:00.000Z',
    registrosFenologicos: [
      { fecha: '2026-06-01T12:00:00.000Z', etapa: 'Emergencia' },
      { fecha: '2026-07-01T12:00:00.000Z', etapa: 'Hoja Bandera' },
    ],
  };

  it('prioriza el último estadio observado anterior a la fecha', () => {
    expect(
      resolverEtapaFenologicaObservada(
        siembra,
        new Date('2026-07-11T12:00:00.000Z'),
        'Trigo',
      )?.etapa,
    ).toBe(3);
  });

  it('no usa observaciones futuras', () => {
    expect(
      resolverEtapaFenologicaObservada(
        siembra,
        new Date('2026-06-15T12:00:00.000Z'),
        'Trigo',
      )?.etapa,
    ).toBe(1);
  });

  it('normaliza alias fenológicos de soja', () => {
    expect(
      resolverEtapaFenologicaObservada(
        { registrosFenologicos: [{ fecha: '2026-07-01', etapa: 'Floración' }] },
        new Date('2026-07-11'),
        'Soja',
      )?.etapa,
    ).toBe('R1');
  });
  it('reemplaza el crono con la etapa observada y conserva el fallback', () => {
    const observada = resolverEtapaFenologicaObservada(
      siembra,
      new Date('2026-07-11T12:00:00.000Z'),
      'Trigo',
    );
    expect(aplicarEtapaFenologicaObservada(1, observada)).toBe(3);
    expect(aplicarEtapaFenologicaObservada(1, undefined)).toBe(1);
  });
});
