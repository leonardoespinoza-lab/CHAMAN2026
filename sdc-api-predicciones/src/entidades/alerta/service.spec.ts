import { AlertasService } from './service';

describe('AlertasService', () => {
  it('finaliza una alerta agroclimatica activa y conserva su historial', async () => {
    const repository = {
      get: jest.fn().mockResolvedValue({
        datos: [
          {
            _id: 'alerta-1',
            activa: true,
            estados: [{ fecha: '2026-07-10T12:00:00.000Z', estado: 'Nueva' }],
          },
        ],
      }),
      update: jest.fn().mockImplementation(async (_id, data) => data),
    };
    const service = new AlertasService(repository as any);

    const finalizada = await service.finalizarEventoSiembra(
      'siembra-1',
      'Riesgo de Granizo',
      'Ventana vencida',
    );

    expect(finalizada).toBe(true);
    expect(repository.update).toHaveBeenCalledWith(
      'alerta-1',
      expect.objectContaining({
        activa: false,
        estadoActual: 'Finalizada',
        fechaVencimiento: expect.any(String),
        estados: expect.arrayContaining([
          expect.objectContaining({
            estado: 'Finalizada',
            comentario: 'Ventana vencida',
          }),
        ]),
      }),
    );
  });

  it('no escribe cuando no existe una alerta activa equivalente', async () => {
    const repository = {
      get: jest.fn().mockResolvedValue({ datos: [] }),
      update: jest.fn(),
    };
    const service = new AlertasService(repository as any);

    const finalizada = await service.finalizarEventoSiembra(
      'siembra-1',
      'Riesgo de Granizo',
      'Ventana vencida',
    );

    expect(finalizada).toBe(false);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('desescala la cabecera al valor vigente y conserva el maximo en reportes', async () => {
    const repository = {
      get: jest.fn().mockResolvedValue({
        datos: [
          {
            _id: 'alerta-1',
            activa: true,
            severidad: 'alta',
            prioridad: 75,
            dedupeKey: 'riesgo de granizo:granizo',
            reportes: [
              {
                eventKey: 'granizo:siembra-1:2026-07-12',
                nivel: 'alto',
                posibilidadPct: 71,
              },
            ],
          },
        ],
      }),
      update: jest.fn().mockImplementation(async (_id, data) => data),
    };
    const service = new AlertasService(repository as any);

    await service.registrarEventoSiembra({
      idSiembra: 'siembra-1',
      descripcion: 'Riesgo de Granizo',
      titulo: 'Vigilancia convectiva por granizo',
      tipo: 'granizo',
      categoria: 'agroclimatica',
      fecha: '2026-07-13T12:00:00.000Z',
      eventKey: 'granizo:siembra-1:2026-07-13',
      reporte: { nivel: 'medio', posibilidadPct: 51 },
      tenant: {},
    });

    expect(repository.update).toHaveBeenCalledWith(
      'alerta-1',
      expect.objectContaining({
        severidad: 'media',
        prioridad: 50,
        reportes: expect.arrayContaining([
          expect.objectContaining({ posibilidadPct: 71 }),
          expect.objectContaining({ posibilidadPct: 51 }),
        ]),
      }),
    );
  });

  it('finaliza una alerta sanitaria v3 por enfermedad al migrar a v4', async () => {
    const repository = {
      get: jest
        .fn()
        .mockResolvedValueOnce({ datos: [] })
        .mockResolvedValueOnce({
          datos: [
            {
              _id: 'alerta-v3',
              activa: true,
              descripcion: 'Riesgo de Enfermedad',
              titulo: 'Roya de la Hoja',
              estados: [],
            },
          ],
        }),
      update: jest.fn().mockImplementation(async (_id, data) => data),
    };
    const service = new AlertasService(repository as any);

    const finalizada = await service.finalizarEventoSiembra(
      'siembra-1',
      'Prediccion sanitaria: Roya de la Hoja',
      'La salida vigente no es alertable',
      'siembra-1:sanitaria:enfermedad:roya-de-la-hoja',
    );

    expect(finalizada).toBe(true);
    const filtroLegado = JSON.parse(
      repository.get.mock.calls[1][0].filter,
    );
    expect(filtroLegado).toEqual(
      expect.objectContaining({
        idSiembra: 'siembra-1',
        activa: true,
        descripcion: 'Riesgo de Enfermedad',
        titulo: 'Roya de la Hoja',
      }),
    );
    expect(repository.update).toHaveBeenCalledWith(
      'alerta-v3',
      expect.objectContaining({ activa: false, estadoActual: 'Finalizada' }),
    );
  });

  it('migra una alerta sanitaria activa v3 a la clave estable v4', async () => {
    const repository = {
      get: jest
        .fn()
        .mockResolvedValueOnce({ datos: [] })
        .mockResolvedValueOnce({ datos: [] })
        .mockResolvedValueOnce({
          datos: [
            {
              _id: 'alerta-v3',
              activa: true,
              descripcion: 'Riesgo de Enfermedad',
              titulo: 'Roya de la Hoja',
              reportes: [],
            },
          ],
        }),
      update: jest.fn().mockImplementation(async (_id, data) => data),
    };
    const service = new AlertasService(repository as any);

    await service.registrarEventoSiembra({
      idSiembra: 'siembra-1',
      descripcion: 'Prediccion sanitaria: Roya de la Hoja',
      titulo: 'Roya de la Hoja',
      tipo: 'enfermedad',
      categoria: 'sanitaria',
      versionMotor: 'v4',
      dedupeKey: 'siembra-1:sanitaria:enfermedad:roya-de-la-hoja',
      fecha: '2026-07-15T03:00:00.000Z',
      eventKey: 'enfermedad:siembra-1:roya-de-la-hoja:v4:2026-07-15',
      reporte: { tipo: 'enfermedad', resultado: 25 },
      tenant: {},
    });

    expect(repository.update).toHaveBeenCalledWith(
      'alerta-v3',
      expect.objectContaining({
        descripcion: 'Prediccion sanitaria: Roya de la Hoja',
        dedupeKey: 'siembra-1:sanitaria:enfermedad:roya-de-la-hoja',
        versionMotor: 'v4',
      }),
    );
  });
});
