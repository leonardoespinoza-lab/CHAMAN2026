import { revealFieldClimateCredential } from '../../auxiliares/fieldclimate-credentials';
import { FieldClimateIntegracionService } from './service';

describe('FieldClimateIntegracionService - renovacion de credenciales', () => {
  const previousEncryptionKey = process.env.FIELDCLIMATE_CREDENTIALS_KEY;

  beforeAll(() => {
    process.env.FIELDCLIMATE_CREDENTIALS_KEY =
      'testing-only-fieldclimate-refresh-key';
  });

  afterAll(() => {
    if (previousEncryptionKey === undefined) {
      delete process.env.FIELDCLIMATE_CREDENTIALS_KEY;
    } else {
      process.env.FIELDCLIMATE_CREDENTIALS_KEY = previousEncryptionKey;
    }
  });

  it('actualiza solo el acceso y conserva identidad, asignacion e historial', async () => {
    let stored: any = {
      _id: 'central-1',
      origen: 'FieldClimate',
      idExterno: '03110EA8',
      idEstablecimiento: 'establecimiento-1',
      user: 'usuario-anterior',
      pass: 'password-anterior',
      name: { original: '03110EA8', custom: 'Simondi' },
      dates: { max_date: '2026-08-15 19:00:00' },
      historialLecturas: [
        {
          fecha: '2026-08-15 19:00:00',
          label: 'Air temperature',
          value: 20,
        },
      ],
      estado: {
        activa: true,
        ultimoError: 'Credenciales FieldClimate rechazadas',
        conexion: 'error_autenticacion',
      },
    };
    const repository = {
      obtenerCentralChaman: jest.fn(async () => stored),
      obtenerCentral: jest.fn(async () => ({
        name: { original: '03110EA8', custom: 'Simondi' },
        dates: { max_date: '2026-08-20 10:00:00' },
      })),
      obtenerSensores: jest.fn(async () => []),
      obtenerUltimosDatos: jest.fn(async () => ({
        dates: ['2026-08-20 10:00:00'],
        data: [
          {
            name: 'Air temperature',
            values: { avg: [21] },
          },
        ],
      })),
      actualizarCentral: jest.fn(async (_id: string, data: any) => {
        stored = { ...stored, ...data };
        return stored;
      }),
      upsertCentral: jest.fn(async (data: any) => {
        stored = { ...stored, ...data };
        return stored;
      }),
      actualizarEstablecimiento: jest.fn(),
      reprocesarAgrometeorologia: jest.fn(),
    };
    const service = new FieldClimateIntegracionService(repository as any);

    const result = await service.actualizarCredenciales('central-1', {
      username: 'usuario-nuevo',
      password: 'password-nuevo',
    });

    expect(stored._id).toBe('central-1');
    expect(stored.idExterno).toBe('03110EA8');
    expect(stored.idEstablecimiento).toBe('establecimiento-1');
    expect(stored.historialLecturas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fecha: '2026-08-15 19:00:00',
          value: 20,
        }),
        expect.objectContaining({
          fecha: '2026-08-20 10:00:00',
          value: 21,
        }),
      ]),
    );
    expect(revealFieldClimateCredential(stored.user)).toBe('usuario-nuevo');
    expect(revealFieldClimateCredential(stored.pass)).toBe('password-nuevo');
    expect(result.user).toBeUndefined();
    expect(result.pass).toBeUndefined();
    expect(repository.actualizarEstablecimiento).not.toHaveBeenCalled();
    expect(repository.reprocesarAgrometeorologia).not.toHaveBeenCalled();
  });

  it('no modifica la central cuando FieldClimate rechaza las credenciales', async () => {
    const repository = {
      obtenerCentralChaman: jest.fn(async () => ({
        _id: 'central-1',
        origen: 'FieldClimate',
        idExterno: '03110EA8',
      })),
      obtenerCentral: jest.fn(async () => {
        throw { status: 401 };
      }),
      actualizarCentral: jest.fn(),
      upsertCentral: jest.fn(),
    };
    const service = new FieldClimateIntegracionService(repository as any);

    await expect(
      service.actualizarCredenciales('central-1', {
        username: 'usuario-invalido',
        password: 'password-invalido',
      }),
    ).rejects.toThrow('FieldClimate rechazo las nuevas credenciales');
    expect(repository.actualizarCentral).not.toHaveBeenCalled();
    expect(repository.upsertCentral).not.toHaveBeenCalled();
  });

  it('no modifica la central si el acceso validado corresponde a otro ID', async () => {
    const repository = {
      obtenerCentralChaman: jest.fn(async () => ({
        _id: 'central-1',
        origen: 'FieldClimate',
        idExterno: '03110EA8',
      })),
      obtenerCentral: jest.fn(async () => ({
        name: { original: 'OTRA-CENTRAL' },
      })),
      actualizarCentral: jest.fn(),
      upsertCentral: jest.fn(),
    };
    const service = new FieldClimateIntegracionService(repository as any);

    await expect(
      service.actualizarCredenciales('central-1', {
        username: 'usuario',
        password: 'password',
      }),
    ).rejects.toThrow(
      'Las credenciales no corresponden a la central seleccionada',
    );
    expect(repository.actualizarCentral).not.toHaveBeenCalled();
    expect(repository.upsertCentral).not.toHaveBeenCalled();
  });
});
