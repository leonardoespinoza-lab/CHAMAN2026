import { CardVisitasLoteComponent } from './card-visitas-lote.component';

describe('CardVisitasLoteComponent', () => {
  const visitaAnterior = {
    _id: 'visita-1',
    idLote: 'lote-1',
    fechaVisita: '2026-08-20T12:00:00.000Z',
    titulo: 'Recorrida sanitaria',
    estado: 'realizada',
    observaciones: 'Se revisaron hojas y brotes.',
  } as any;
  const visitaReciente = {
    _id: 'visita-2',
    idLote: 'lote-1',
    fechaVisita: '2026-09-02T12:00:00.000Z',
    titulo: 'Control de riego',
    estado: 'realizada',
    hallazgos: 'Sin anegamiento.',
  } as any;
  const audio = {
    _id: 'audio-1',
    idLote: 'lote-1',
    idVisita: 'visita-2',
    fuente: 'campo',
    tipoMedio: 'audio',
    titulo: 'Nota de la recorrida',
    mimeType: 'audio/webm',
  } as any;

  function subject() {
    const visitasService = {
      listarPorLote: jasmine.createSpy('listarPorLote').and.resolveTo({
        datos: [visitaAnterior, visitaReciente],
        totalCount: 2,
      }),
      crear: jasmine.createSpy('crear'),
      actualizar: jasmine.createSpy('actualizar'),
      archivar: jasmine.createSpy('archivar'),
    };
    const fotosService = {
      listarPorLote: jasmine.createSpy('listarPorLote').and.resolveTo({
        datos: [audio],
        totalCount: 1,
      }),
      getAudio: jasmine
        .createSpy('getAudio')
        .and.resolveTo(new Blob(['audio'], { type: 'audio/webm' })),
    };
    const helper = {
      notifError: jasmine.createSpy('notifError'),
      notifSuccess: jasmine.createSpy('notifSuccess'),
      soloLectura: () => false,
    };
    const component = new CardVisitasLoteComponent(
      visitasService as any,
      fotosService as any,
      { confirm: jasmine.createSpy('confirm') } as any,
      helper as any,
    );
    component.lote = { _id: 'lote-1' } as any;
    return { component, fotosService };
  }

  it('expone todas las visitas en orden y conserva sus comentarios', async () => {
    const { component } = subject();

    await component.cargar();

    expect(component.visitasOrdenadas.map((visita) => visita._id)).toEqual([
      'visita-2',
      'visita-1',
    ]);
    expect(component.resumenVisita(visitaAnterior)).toBe(
      'Se revisaron hojas y brotes.',
    );
  });

  it('muestra y recupera de forma autenticada el audio vinculado a la visita', async () => {
    spyOn(URL, 'createObjectURL').and.returnValue('blob:audio-visita');
    const revoke = spyOn(URL, 'revokeObjectURL');
    const { component, fotosService } = subject();
    await component.cargar();

    component.abrirVisita(visitaReciente);
    await Promise.resolve();
    await Promise.resolve();

    expect(component.evidenciasDe(visitaReciente)).toEqual([audio]);
    expect(fotosService.getAudio).toHaveBeenCalledOnceWith('audio-1');
    expect(component.audioDe(audio)).toBe('blob:audio-visita');

    component.ngOnDestroy();
    expect(revoke).toHaveBeenCalledWith('blob:audio-visita');
  });
});
