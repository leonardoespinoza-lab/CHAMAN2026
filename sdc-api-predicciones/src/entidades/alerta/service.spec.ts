import { AlertasService } from './service';

describe('AlertasService - comandos atomicos', () => {
  const eventoGranizo = () => ({
    idSiembra: 'siembra-1',
    descripcion: 'Riesgo de Granizo',
    titulo: 'Vigilancia convectiva por granizo',
    tipo: 'granizo',
    categoria: 'agroclimatica' as const,
    fecha: '2026-07-13T12:00:00.000Z',
    eventKey: 'granizo:siembra-1:2026-07-13',
    reporte: { nivel: 'medio', posibilidadPct: 51 },
    tenant: {},
  });

  it('finaliza todas las equivalentes con un solo comando de datos', async () => {
    const repository = {
      finalizarEventoSiembra: jest.fn().mockResolvedValue({
        finalizada: true,
        modificadas: 2,
      }),
      get: jest.fn(),
      update: jest.fn(),
    };
    const service = new AlertasService(repository as any);

    const finalizada = await service.finalizarEventoSiembra(
      'siembra-1',
      'Riesgo de Granizo',
      'Ventana vencida',
    );

    expect(finalizada).toBe(true);
    expect(repository.finalizarEventoSiembra).toHaveBeenCalledWith({
      idSiembra: 'siembra-1',
      descripcion: 'Riesgo de Granizo',
      comentario: 'Ventana vencida',
      dedupeKey: undefined,
      tituloLegado: undefined,
      fecha: expect.any(String),
    });
    expect(repository.get).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('informa false cuando el comando atomico no modifico alertas', async () => {
    const repository = {
      finalizarEventoSiembra: jest.fn().mockResolvedValue({
        finalizada: false,
        modificadas: 0,
      }),
    };
    const service = new AlertasService(repository as any);

    await expect(
      service.finalizarEventoSiembra(
        'siembra-1',
        'Riesgo de Granizo',
        'Ventana vencida',
      ),
    ).resolves.toBe(false);
  });

  it('envia cabecera vigente y reporte a una sola operacion idempotente', async () => {
    const repository = {
      registrarEventoSiembra: jest.fn().mockResolvedValue({
        alerta: { _id: 'alerta-1' },
        creada: false,
        duplicada: false,
      }),
      get: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    const service = new AlertasService(repository as any);

    await service.registrarEventoSiembra(eventoGranizo());

    expect(repository.registrarEventoSiembra).toHaveBeenCalledWith({
      alerta: expect.objectContaining({
        idSiembra: 'siembra-1',
        activa: true,
        severidad: 'media',
        prioridad: 50,
        dedupeKey:
          'siembra-1:agroclimatica:granizo:vigilancia-convectiva-por-granizo',
        fechaUltimoEvento: '2026-07-13T12:00:00.000Z',
      }),
      eventKey: 'granizo:siembra-1:2026-07-13',
      reporte: expect.objectContaining({
        eventKey: 'granizo:siembra-1:2026-07-13',
        posibilidadPct: 51,
        severidad: 'media',
      }),
    });
    expect(repository.get).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('incluye la identidad v3 al finalizar una enfermedad v4', async () => {
    const repository = {
      finalizarEventoSiembra: jest.fn().mockResolvedValue({
        finalizada: true,
        modificadas: 2,
      }),
    };
    const service = new AlertasService(repository as any);

    await service.finalizarEventoSiembra(
      'siembra-1',
      'Prediccion sanitaria: Roya de la Hoja',
      'La salida vigente no es alertable',
      'siembra-1:sanitaria:enfermedad:roya-de-la-hoja',
    );

    expect(repository.finalizarEventoSiembra).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: 'siembra-1:sanitaria:enfermedad:roya-de-la-hoja',
        tituloLegado: 'Roya de la Hoja',
      }),
    );
  });

  it('delega la migracion sanitaria v3/v4 al comando atomico', async () => {
    const repository = {
      registrarEventoSiembra: jest.fn().mockResolvedValue({
        alerta: { _id: 'alerta-v3' },
        creada: false,
        duplicada: false,
      }),
      get: jest.fn(),
      update: jest.fn(),
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

    expect(repository.registrarEventoSiembra).toHaveBeenCalledWith(
      expect.objectContaining({
        alerta: expect.objectContaining({
          descripcion: 'Prediccion sanitaria: Roya de la Hoja',
          dedupeKey: 'siembra-1:sanitaria:enfermedad:roya-de-la-hoja',
          versionMotor: 'v4',
        }),
      }),
    );
    expect(repository.get).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });
});
