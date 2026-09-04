import { SiembrasService } from './service';

describe('salida publica de prediccion de malezas', () => {
  it('elimina parametros legacy sin romper documentos Mongoose del listado', async () => {
    const repository = {
      getFilter: jest.fn().mockResolvedValue({
        totalCount: 1,
        datos: [
          {
            toObject: () => ({
              _id: 'siembra-1',
              nombre: 'Lote prueba',
              ultimaPrediccionMalezas: {
                estado: 'operativo',
                especies: [
                  {
                    nombre: 'Eleusine',
                    avancePct: 12,
                    formula: 'secreto legacy',
                    temperaturaBase: 8,
                    deltaHoras: 24,
                  },
                ],
              },
            }),
          },
        ],
      }),
    };
    const service = new SiembrasService(
      repository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await service.getFilter({});
    const especie = (result.datos[0] as any).ultimaPrediccionMalezas
      .especies[0];

    expect((result.datos[0] as any).nombre).toBe('Lote prueba');
    expect(especie).toMatchObject({ nombre: 'Eleusine', avancePct: 12 });
    expect(especie.formula).toBeUndefined();
    expect(especie.temperaturaBase).toBeUndefined();
    expect(especie.deltaHoras).toBeUndefined();
  });
});
