import { CardRegistroFotograficoComponent } from './card-registro-fotografico.component';

describe('CardRegistroFotograficoComponent', () => {
  const fotoCampo = {
    _id: 'foto-1',
    idLote: 'lote-1',
    fuente: 'campo',
    url: 'https://storage.example/imagenes/CAMPO/lote-1/predecible.jpg',
    mimeType: 'image/jpeg',
    fechaCaptura: '2026-07-23T12:00:00.000Z',
  } as any;

  function subject() {
    let archivada = false;
    const fotosService = {
      listarPorLote: jasmine
        .createSpy('listarPorLote')
        .and.callFake(() =>
          Promise.resolve({
            datos: archivada ? [] : [fotoCampo],
            totalCount: archivada ? 0 : 1,
          }),
        ),
      getImagen: jasmine
        .createSpy('getImagen')
        .and.resolveTo(new Blob(['imagen'], { type: 'image/jpeg' })),
      eliminar: jasmine.createSpy('eliminar').and.callFake(() => {
        archivada = true;
        return Promise.resolve();
      }),
      subirCampo: jasmine.createSpy('subirCampo'),
      actualizar: jasmine.createSpy('actualizar').and.resolveTo({}),
    };
    const visitasService = {
      listarPorLote: jasmine
        .createSpy('listarPorLote')
        .and.resolveTo({ datos: [], totalCount: 0 }),
    };
    let confirmacion: any;
    const confirmation = {
      confirm: jasmine.createSpy('confirm').and.callFake((options) => {
        confirmacion = options;
      }),
    };
    const helper = {
      notifError: jasmine.createSpy('notifError'),
      notifSuccess: jasmine.createSpy('notifSuccess'),
      soloLectura: () => false,
    };
    const component = new CardRegistroFotograficoComponent(
      fotosService as any,
      visitasService as any,
      confirmation as any,
      helper as any,
    );
    component.lote = { _id: 'lote-1' } as any;
    return {
      component,
      fotosService,
      visitasService,
      confirmation,
      getConfirmacion: () => confirmacion,
    };
  }

  it('nunca usa la URL publica persistida y crea un object URL del blob autenticado', async () => {
    spyOn(URL, 'createObjectURL').and.returnValue('blob:foto-autenticada');
    const revoke = spyOn(URL, 'revokeObjectURL');
    const { component, fotosService } = subject();

    await component.cargar();

    expect(fotosService.getImagen).toHaveBeenCalledOnceWith('foto-1');
    expect(component.imagenDe(fotoCampo)).toBe('blob:foto-autenticada');
    expect(component.imagenDe(fotoCampo)).not.toBe(fotoCampo.url);

    component.ngOnDestroy();
    expect(revoke).toHaveBeenCalledWith('blob:foto-autenticada');
  });

  it('revoca y retira la imagen local apenas el servidor confirma el archivo', async () => {
    spyOn(URL, 'createObjectURL').and.returnValue('blob:foto-autenticada');
    const revoke = spyOn(URL, 'revokeObjectURL');
    const { component, fotosService, getConfirmacion } = subject();
    await component.cargar();
    component.verFoto(fotoCampo);

    component.archivarFoto(fotoCampo);
    await getConfirmacion().accept();

    expect(fotosService.eliminar).toHaveBeenCalledOnceWith('foto-1');
    expect(component.fotos).toEqual([]);
    expect(component.fotoSeleccionada).toBeUndefined();
    expect(component.imagenDe(fotoCampo)).toBe('');
    expect(revoke).toHaveBeenCalledWith('blob:foto-autenticada');
  });

  it('actualiza las visitas disponibles al abrir un nuevo audio', async () => {
    const { component, visitasService } = subject();
    visitasService.listarPorLote.and.resolveTo({
      datos: [{ _id: 'visita-nueva', titulo: 'Visita recien creada' }],
      totalCount: 1,
    });

    component.abrirRegistroAudio();
    await Promise.resolve();
    await Promise.resolve();

    expect(visitasService.listarPorLote).toHaveBeenCalledWith('lote-1');
    expect(component.visitas.map((visita) => visita._id)).toEqual(['visita-nueva']);
  });

  it('permite vincular un audio existente con una visita', async () => {
    const { component, fotosService } = subject();
    const audio = { _id: 'audio-1', idVisita: 'visita-1' } as any;

    await component.guardarVinculoVisita(audio);

    expect(fotosService.actualizar).toHaveBeenCalledOnceWith('audio-1', {
      idVisita: 'visita-1',
    });
  });
});
