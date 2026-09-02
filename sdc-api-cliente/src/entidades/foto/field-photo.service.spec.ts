import { BadRequestException } from '@nestjs/common';
import { FotosService } from './service';
import {
  FotosRepository,
  isPrivateFieldPhotoStorageUrl,
  requireTimelapseAdminToken,
  resolveStoredAudioUrl,
  resolveStoredPhotoUrl,
} from './repository';

describe('FotosService - registro fotografico de campo', () => {
  function subject() {
    const repository = {
      getById: jest.fn().mockResolvedValue({
        _id: 'foto-1',
        idLote: 'lote-1',
        url: 'https://legacy.example/imagenes/CAMPO/lote-1/foto.jpg',
        fuente: 'campo',
      }),
      getLoteById: jest.fn().mockResolvedValue({ _id: 'lote-1', idProductor: 'productor-1' }),
      getImagen: jest.fn().mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff])),
      getAudio: jest.fn().mockResolvedValue(Buffer.from('OggSdatos')),
      uploadCampo: jest.fn().mockResolvedValue({
        publicUrl: 'https://testing.example/imagenes/CAMPO/lote-1/foto.jpg',
        size: 4,
        contentType: 'image/jpeg',
        fechaCaptura: '2026-07-22T12:00:00.000Z',
      }),
      uploadAudio: jest.fn().mockResolvedValue({
        publicUrl: 'https://testing.example/audios/AUDIO-CAMPO/lote-1/nota.ogg',
        size: 9,
        contentType: 'audio/ogg',
        fechaCaptura: '2026-09-02T12:00:00.000Z',
      }),
      get: jest.fn().mockResolvedValue({ datos: [], totalCount: 0 }),
      create: jest.fn((data) => Promise.resolve({ _id: 'foto-1', ...data })),
      update: jest.fn((id, data) => Promise.resolve({ _id: id, ...data })),
    };
    const visitas = {
      getById: jest.fn().mockResolvedValue({ _id: 'visita-1', idLote: 'lote-1' }),
    };
    return {
      service: new FotosService(repository as any, visitas as any),
      repository,
      visitas,
    };
  }

  const permiso = { nivel: 'Productor', rol: 'Escritura', idProductor: 'productor-1' } as any;
  const user = { _id: 'usuario-1', username: 'productor.campo' } as any;
  const jpeg = {
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    originalname: 'evidencia.jpg',
    mimetype: 'image/jpeg',
    size: 4,
  };

  it('mantiene audios fuera de los listados historicos de camaras y time-lapse', async () => {
    const { service, repository } = subject();
    await service.get({ filter: JSON.stringify({ idLote: 'lote-1' }) }, {
      nivel: 'Admin',
      rol: 'Admin',
    } as any);

    const query = repository.get.mock.calls[0][0];
    expect(JSON.parse(query.filter)).toEqual({
      idLote: 'lote-1',
      tipoMedio: { $ne: 'audio' },
    });
  });

  it('guarda el binario fuera de Mongo y registra solo su evidencia y auditoria', async () => {
    const { service, repository } = subject();

    const result = await service.uploadCampo(
      [jpeg],
      { idLote: 'lote-1', titulo: 'Prueba de emergencia', etiquetas: 'emergencia,sector norte' },
      permiso,
      user,
    );

    expect(repository.uploadCampo).toHaveBeenCalledWith('lote-1', jpeg);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        idLote: 'lote-1',
        fuente: 'campo',
        url: expect.stringContaining('/imagenes/'),
        creadaPorUsuario: 'usuario-1',
        estadoIA: 'lista',
      }),
    );
    expect((repository.create.mock.calls[0][0] as any).buffer).toBeUndefined();
    expect(result).toHaveLength(1);
  });

  it('rechaza un archivo cuyo contenido no coincide con su MIME declarado', async () => {
    const { service, repository } = subject();

    await expect(
      service.uploadCampo(
        [{ ...jpeg, buffer: Buffer.from('no-es-una-imagen'), size: 17 }],
        { idLote: 'lote-1' },
        permiso,
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.uploadCampo).not.toHaveBeenCalled();
  });

  it('impide asociar una foto a una visita de otro lote', async () => {
    const { service, repository, visitas } = subject();
    visitas.getById.mockResolvedValue({ _id: 'visita-ajena', idLote: 'lote-otro' });

    await expect(
      service.uploadCampo(
        [jpeg],
        { idLote: 'lote-1', idVisita: 'visita-ajena' },
        permiso,
        user,
      ),
    ).rejects.toThrow('no pertenece a este lote');
    expect(repository.uploadCampo).not.toHaveBeenCalled();
  });

  it('impide cambiar la visita de una foto a una visita de otro lote', async () => {
    const { service, repository, visitas } = subject();
    visitas.getById.mockResolvedValue({
      _id: 'visita-ajena',
      idLote: 'lote-otro',
    });

    await expect(
      service.update(
        'foto-1',
        { idVisita: 'visita-ajena' } as any,
        permiso,
      ),
    ).rejects.toThrow('no pertenece al lote de esta foto');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('acepta solo campos descriptivos y no permite alterar IA ni auditoria', async () => {
    const { service, repository } = subject();

    await service.update(
      'foto-1',
      {
        titulo: 'Seguimiento',
        descripcion: 'Sin sintomas visibles',
        etiquetas: ['hoja'],
        estadoIA: 'analizada',
        archivado: true,
        fechaArchivado: '2026-07-23T00:00:00.000Z',
        archivadoPor: 'intruso',
        motivoArchivado: 'manipulado',
      } as any,
      permiso,
    );

    const actualizacion = repository.update.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(actualizacion).toEqual(
      expect.objectContaining({
        titulo: 'Seguimiento',
        descripcion: 'Sin sintomas visibles',
        etiquetas: ['hoja'],
      }),
    );
    expect(actualizacion).not.toHaveProperty('estadoIA');
    expect(actualizacion).not.toHaveProperty('archivado');
    expect(actualizacion).not.toHaveProperty('fechaArchivado');
    expect(actualizacion).not.toHaveProperty('archivadoPor');
    expect(actualizacion).not.toHaveProperty('motivoArchivado');
  });

  it('respeta la deshabilitacion del modulo antes de consultar el lote', async () => {
    const { service, repository } = subject();

    await expect(
      service.uploadCampo(
        [jpeg],
        { idLote: 'lote-1' },
        { ...permiso, modulos: { RegistroFotografico: false } },
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.getLoteById).not.toHaveBeenCalled();
  });

  it('permite registrar evidencia al Tenant dueño del lote', async () => {
    const { service, repository } = subject();
    repository.getLoteById.mockResolvedValue({
      _id: 'lote-1',
      idTenant: 'tenant-a',
    });

    await expect(
      service.uploadCampo(
        [jpeg],
        { idLote: 'lote-1' },
        { nivel: 'Tenant', rol: 'Escritura', idTenant: 'tenant-a' } as any,
        user,
      ),
    ).resolves.toHaveLength(1);
  });

  it('rechaza evidencia de un Tenant ajeno al lote', async () => {
    const { service, repository } = subject();
    repository.getLoteById.mockResolvedValue({
      _id: 'lote-1',
      idTenant: 'tenant-a',
    });

    await expect(
      service.uploadCampo(
        [jpeg],
        { idLote: 'lote-1' },
        { nivel: 'Tenant', rol: 'Escritura', idTenant: 'tenant-b' } as any,
        user,
      ),
    ).rejects.toThrow('No tiene permiso');
    expect(repository.uploadCampo).not.toHaveBeenCalled();
  });

  it('descarga solo la URL persistida de una foto autorizada', async () => {
    const { service, repository } = subject();

    await expect(service.getImagen('foto-1', permiso)).resolves.toEqual(
      Buffer.from([0xff, 0xd8, 0xff]),
    );

    expect(repository.getById).toHaveBeenCalledWith('foto-1');
    expect(repository.getImagen).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'foto-1',
        url: expect.stringContaining('/imagenes/'),
      }),
    );
  });

  it('no busca la imagen si el usuario no tiene acceso al lote', async () => {
    const { service, repository } = subject();

    await expect(
      service.getImagen('foto-1', {
        nivel: 'Productor',
        rol: 'Lectura',
        idProductor: 'productor-ajeno',
      } as any),
    ).rejects.toThrow('No tiene permiso');

    expect(repository.getImagen).not.toHaveBeenCalled();
  });

  it('retira inmediatamente la imagen archivada del endpoint autenticado', async () => {
    const { service, repository } = subject();
    repository.getById.mockResolvedValue({
      _id: 'foto-1',
      idLote: 'lote-1',
      url: 'https://legacy.example/imagenes/CAMPO/lote-1/foto.jpg',
      fuente: 'campo',
      archivado: true,
    });

    await expect(service.getImagen('foto-1', permiso)).rejects.toThrow(
      'Foto no encontrada',
    );
    expect(repository.getImagen).not.toHaveBeenCalled();
  });

  it('registra un audio fuera de Mongo con tipo y auditoria separados', async () => {
    const { service, repository } = subject();
    const audio = {
      buffer: Buffer.from('OggSdatos'),
      originalname: 'recorrida.ogg',
      mimetype: 'audio/ogg',
      size: 9,
    };
    await expect(
      service.uploadAudio(
        audio,
        { idLote: 'lote-1', titulo: 'Recorrida norte', duracionSegundos: 12 },
        permiso,
        user,
      ),
    ).resolves.toEqual(expect.objectContaining({ tipoMedio: 'audio' }));
    expect(repository.uploadAudio).toHaveBeenCalledWith('lote-1', audio);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoMedio: 'audio',
        url: expect.stringContaining('/audios/AUDIO-CAMPO/'),
        duracionSegundos: 12,
      }),
    );
  });

  it('rechaza un archivo disfrazado de audio', async () => {
    const { service, repository } = subject();
    await expect(
      service.uploadAudio(
        { buffer: Buffer.from('texto'), originalname: 'falso.mp3', mimetype: 'audio/mpeg', size: 5 },
        { idLote: 'lote-1' },
        permiso,
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.uploadAudio).not.toHaveBeenCalled();
  });
});

describe('resolveStoredAudioUrl - politica anti SSRF', () => {
  const trustedBase = 'https://ftp.chaman.example';
  it('solo reconstruye rutas del namespace privado de audio', () => {
    expect(
      resolveStoredAudioUrl(
        'https://legacy.example/audios/AUDIO-CAMPO/lote-1/nota.ogg',
        trustedBase,
      ),
    ).toBe('https://ftp.chaman.example/audios/AUDIO-CAMPO/lote-1/nota.ogg');
    expect(() =>
      resolveStoredAudioUrl('http://169.254.169.254/latest/meta-data', trustedBase),
    ).toThrow('fuente del audio');
  });
});

describe('resolveStoredPhotoUrl - politica anti SSRF', () => {
  const trustedBase = 'https://ftp.chaman.example';

  it('ignora el host historico y usa solo el origen FTP configurado', () => {
    expect(
      resolveStoredPhotoUrl(
        'https://legacy.example/imagenes/CAMPO/lote-1/foto.jpg',
        trustedBase,
      ),
    ).toBe(
      'https://ftp.chaman.example/imagenes/CAMPO/lote-1/foto.jpg',
    );
  });

  it('rechaza destinos internos y rutas ajenas al almacen de imagenes', () => {
    expect(() =>
      resolveStoredPhotoUrl(
        'http://169.254.169.254/latest/meta-data',
        trustedBase,
      ),
    ).toThrow('fuente de la foto');
    expect(() =>
      resolveStoredPhotoUrl(
        'https://legacy.example/imagenes/../admin',
        trustedBase,
      ),
    ).toThrow('fuente de la foto');
  });

  it('bloquea query strings, fragmentos y credenciales embebidas', () => {
    expect(() =>
      resolveStoredPhotoUrl(
        'https://legacy.example/imagenes/foto.jpg?next=http://127.0.0.1',
        trustedBase,
      ),
    ).toThrow('fuente de la foto');
    expect(() =>
      resolveStoredPhotoUrl(
        'https://user:pass@legacy.example/imagenes/foto.jpg',
        trustedBase,
      ),
    ).toThrow('fuente de la foto');
    expect(() =>
      resolveStoredPhotoUrl(
        'https://legacy.example/imagenes/%252e%252e/admin.jpg',
        trustedBase,
      ),
    ).toThrow('fuente de la foto');
  });
});

describe('requireTimelapseAdminToken - almacenamiento fail closed', () => {
  it('rechaza la carga cuando el secreto operativo no esta configurado', () => {
    expect(() => requireTimelapseAdminToken('')).toThrow(
      'no tiene configurado su token operativo',
    );
  });

  it('entrega solo un secreto no vacio', () => {
    expect(requireTimelapseAdminToken(' secreto-compartido ')).toBe(
      'secreto-compartido',
    );
  });
});

describe('FotosRepository - proxy privado de fotos de campo', () => {
  it('autentica internamente CAMPO sin exponer el secreto al navegador', async () => {
    const axios = { GET: jest.fn().mockResolvedValue(Buffer.from('imagen')) };
    const repository = new FotosRepository(axios as any);

    await repository.getImagen({
      fuente: 'campo',
      url: 'https://legacy.example/imagenes/CAMPO/lote-1/foto.jpg',
    } as any, 'secreto-operativo');

    expect(axios.GET).toHaveBeenCalledWith(
      expect.stringContaining('/imagenes/CAMPO/lote-1/foto.jpg'),
      expect.objectContaining({
        responseType: 'arraybuffer',
        maxRedirects: 0,
        headers: {
          Authorization: expect.stringMatching(/^Bearer\s+\S+/),
          'x-timelapse-token': expect.any(String),
        },
      }),
    );
  });

  it('mantiene publicas las capturas legacy ajenas a CAMPO', async () => {
    const axios = { GET: jest.fn().mockResolvedValue(Buffer.from('imagen')) };
    const repository = new FotosRepository(axios as any);

    await repository.getImagen({
      fuente: 'ftp',
      url: 'https://legacy.example/imagenes/CAMARA-1/2026-07-23/foto.jpg',
    } as any, '');

    expect(axios.GET).toHaveBeenCalledWith(
      expect.stringContaining('/imagenes/CAMARA-1/2026-07-23/foto.jpg'),
      expect.objectContaining({ headers: undefined }),
    );
  });

  it('identifica el namespace CAMPO sin depender de mayusculas', () => {
    expect(
      isPrivateFieldPhotoStorageUrl(
        'https://ftp.example/imagenes/campo/lote/foto.jpg',
      ),
    ).toBe(true);
    expect(
      isPrivateFieldPhotoStorageUrl(
        'https://ftp.example/imagenes/CAMARA/lote/foto.jpg',
      ),
    ).toBe(false);
  });
});
