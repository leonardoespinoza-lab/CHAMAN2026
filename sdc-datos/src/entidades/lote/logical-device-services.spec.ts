import { LotesRepository } from './repository';

describe('LotesRepository - aislamiento de servicios logicos', () => {
  it('expone al lote solamente el servicio y las lecturas que tiene asignados', async () => {
    const lote: any = { _id: 'lote-napa', nombre: 'Lote Napa' };
    const loteQuery: any = {
      populate: jest.fn(),
      lean: jest.fn().mockResolvedValue(lote),
    };
    loteQuery.populate.mockReturnValue(loteQuery);

    const controlador: any = {
      _id: 'controlador-arturo',
      deveui: '24E124454E358347',
      sensores: [
        'Humedad Suelo Profundidad',
        'Temperatura Suelo',
        'Salinidad Suelo',
        'Entrada Analógica',
        'Presión',
        'Napa',
        'Batería',
      ],
      configuracionLecturas: {
        perfilSuelo: { tipo: 'sonda_sentek_120cm', niveles: 12 },
        entradaAnalogica: { variable: 'nivel_napa', tipoSenal: '4-20mA' },
      },
      servicios: [
        {
          id: 'perfil-suelo-sentek',
          tipo: 'perfil_suelo',
          nombre: 'Perfil Sentek',
          sensores: [
            'Humedad Suelo Profundidad',
            'Temperatura Suelo',
            'Salinidad Suelo',
          ],
          idLote: 'lote-sentek',
        },
        {
          id: 'nivel-napa',
          tipo: 'nivel_napa',
          nombre: 'Nivel de napa',
          sensores: ['Entrada Analógica', 'Presión', 'Napa'],
          idLote: 'lote-napa',
        },
      ],
      ultimoReporte: {
        datos: {
          valores: {
            'Humedad Suelo Profundidad': [20, 21],
            'Salinidad Suelo': [1.1, 1.2],
            'Entrada Analógica': 9.24,
            Presión: 3.275,
            Napa: 2.725,
            Batería: 96,
          },
        },
      },
    };
    const dispositivoQuery = {
      lean: jest.fn().mockResolvedValue([controlador]),
    };
    const model = { findById: jest.fn().mockReturnValue(loteQuery) };
    const dispositivoModel = {
      find: jest.fn().mockReturnValue(dispositivoQuery),
    };
    const repository = new LotesRepository(
      model as any,
      dispositivoModel as any,
    );

    const response: any = await repository.getById('lote-napa');
    const dispositivo = response.dispositivos[0];

    expect(dispositivo.servicios.map((item) => item.id)).toEqual([
      'nivel-napa',
    ]);
    expect(dispositivo.ultimoReporte.datos.valores).toEqual({
      'Entrada Analógica': 9.24,
      Presión: 3.275,
      Napa: 2.725,
      Batería: 96,
    });
    expect(dispositivo.configuracionLecturas.perfilSuelo).toBeUndefined();
    expect(dispositivo.configuracionLecturas.entradaAnalogica.variable).toBe(
      'nivel_napa',
    );
  });
});
