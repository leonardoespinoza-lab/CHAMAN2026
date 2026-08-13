import { DispositivosService } from './service';

describe('DispositivosService - servicios logicos del controlador', () => {
  it('entrega a cada productor solo las variables del servicio asignado', async () => {
    const dispositivo: any = {
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
          idProductor: 'productor-sentek',
          idLote: 'lote-sentek',
        },
        {
          id: 'nivel-napa',
          tipo: 'nivel_napa',
          nombre: 'Nivel de napa',
          sensores: ['Entrada Analógica', 'Presión', 'Napa'],
          idProductor: 'productor-napa',
          idLote: 'lote-napa',
        },
      ],
      configuracionLecturas: {
        perfilSuelo: { tipo: 'sonda_sentek_120cm', niveles: 12 },
        entradaAnalogica: {
          canal: 1,
          tipoSenal: '4-20mA',
          variable: 'nivel_napa',
        },
      },
      ultimoReporte: {
        datos: {
          valores: {
            'Humedad Suelo Profundidad': [20, 21],
            'Temperatura Suelo': [15, 14],
            'Salinidad Suelo': [1.1, 1.2],
            'Entrada Analógica': 9.24,
            Presión: 3.275,
            Napa: 2.725,
            Batería: 96,
          },
        },
      },
    };
    const repository = {
      getById: jest.fn().mockResolvedValue(dispositivo),
    };
    const service = new DispositivosService(repository as any);
    const user: any = {
      permisos: [{ nivel: 'Productor', idProductor: 'productor-napa' }],
    };

    const response = await service.getById('controlador-arturo', user);

    expect(response.servicios?.map((item) => item.id)).toEqual(['nivel-napa']);
    expect(response.ultimoReporte?.datos.valores).toEqual({
      'Entrada Analógica': 9.24,
      Presión: 3.275,
      Napa: 2.725,
      Batería: 96,
    });
    expect(
      response.ultimoReporte?.datos.valores['Salinidad Suelo'],
    ).toBeUndefined();
    expect(response.configuracionLecturas?.perfilSuelo).toBeUndefined();
    expect(response.configuracionLecturas?.entradaAnalogica?.variable).toBe(
      'nivel_napa',
    );
  });
});
