import { resolverLoteInicialSeguro } from './detalles-lote.component';

describe('Integridad de navegación entre lotes', () => {
  it('nunca reutiliza datos de otro lote cuando la URL apunta a un id diferente', () => {
    const stale = { _id: 'lote-anterior', nombre: 'Lote anterior' } as any;

    expect(
      resolverLoteInicialSeguro('lote-solicitado', undefined, stale)
    ).toBeUndefined();
  });

  it('permite precarga únicamente cuando el id coincide exactamente', () => {
    const current = { _id: 'lote-solicitado', nombre: 'Lote correcto' } as any;

    expect(
      resolverLoteInicialSeguro('lote-solicitado', undefined, current)
    ).toBe(current);
  });

  it('también descarta una entrada de cache inconsistente', () => {
    const staleCache = { _id: 'lote-cache-incorrecto' } as any;
    const current = { _id: 'lote-solicitado' } as any;

    expect(
      resolverLoteInicialSeguro('lote-solicitado', staleCache, current)
    ).toBe(current);
  });
});
