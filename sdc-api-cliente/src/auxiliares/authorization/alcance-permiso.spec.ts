import {
  agregarAlcanceLotes,
  permisoPuedeVerEstablecimiento,
  permisoPuedeVerLote,
} from './alcance-permiso';

describe('alcance asesor', () => {
  const permiso: any = {
    nivel: 'Asesor',
    rol: 'Admin',
    idEstablecimientos: ['est-1', 'est-2'],
    idLotes: ['lote-1'],
  };

  it('solo acepta establecimientos asignados', () => {
    expect(permisoPuedeVerEstablecimiento(permiso, 'est-1')).toBe(true);
    expect(permisoPuedeVerEstablecimiento(permiso, 'est-3')).toBe(false);
  });

  it('permite todos los lotes de los establecimientos del asesor', () => {
    expect(
      permisoPuedeVerLote(permiso, {
        _id: 'lote-1',
        idEstablecimiento: 'est-1',
      }),
    ).toBe(true);
    expect(
      permisoPuedeVerLote(permiso, {
        _id: 'lote-2',
        idEstablecimiento: 'est-1',
      }),
    ).toBe(true);
    expect(
      permisoPuedeVerLote(permiso, {
        _id: 'lote-1',
        idEstablecimiento: 'est-3',
      }),
    ).toBe(false);
  });

  it('limita listados por establecimiento y no por lote para el asesor', () => {
    const filtro: any = {};
    agregarAlcanceLotes(filtro, permiso);
    expect(filtro.$and).toEqual([
      { idEstablecimiento: { $in: ['est-1', 'est-2'] } },
    ]);
  });

  it('mantiene la restriccion por lote para usuarios delegados', () => {
    const delegado: any = {
      nivel: 'Establecimiento',
      rol: 'Lectura',
      idEstablecimiento: 'est-1',
      idLotes: ['lote-1'],
    };
    expect(
      permisoPuedeVerLote(delegado, {
        _id: 'lote-1',
        idEstablecimiento: 'est-1',
      }),
    ).toBe(true);
    expect(
      permisoPuedeVerLote(delegado, {
        _id: 'lote-2',
        idEstablecimiento: 'est-1',
      }),
    ).toBe(false);
  });
});
