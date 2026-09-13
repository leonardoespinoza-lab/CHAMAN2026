import { seguirCalculoFenologico } from './seguir-calculo-fenologico';
import { revisionResultadosFenologicos } from 'modelos/src';
import { DetallesLoteComponent } from './detalles-lote.component';

describe('Seguimiento de calculos asincronos', () => {
  it('espera completitud con consultas de solo lectura acotadas', async () => {
    let llamadas = 0;
    const read: any = async () => ({ registroId: 'r1', estado: ++llamadas < 3 ? 'procesando' : 'completado' });
    expect((await seguirCalculoFenologico(read, new AbortController().signal, async () => {}, 5))?.estado).toBe(
      'completado'
    );
    expect(llamadas).toBe(3);
  });
  it('termina al llegar al limite y no presenta el timeout como exito', async () => {
    const read = jasmine.createSpy().and.resolveTo({ registroId: 'r1', estado: 'pendiente' });
    expect(await seguirCalculoFenologico(read, new AbortController().signal, async () => {}, 2)).toBeUndefined();
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('descarta una respuesta tardia al cambiar de lote o registrar otra etapa', async () => {
    const control = new AbortController();
    let finish!: (value: any) => void;
    const result = seguirCalculoFenologico(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      control.signal
    );
    control.abort();
    finish({ registroId: 'r1', estado: 'completado' });
    expect(await result).toBeUndefined();
  });
  it('invalida la cache al terminar aun cuando no cambio el registro', () => {
    const base: any = { registrosFenologicos: [{ id: 'r1' }] };
    expect(revisionResultadosFenologicos(base)).not.toEqual(
      revisionResultadosFenologicos({
        ...base,
        calculoFenologico: { registroId: 'r1', estado: 'completado', completadoEn: '2026-09-13T12:00:00Z' },
      })
    );
  });

  function panel(api: any): DetallesLoteComponent {
    const c = new DetallesLoteComponent(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      api,
      {} as any,
      {} as any,
      {} as any
    );
    c.lote = { _id: 'l1', idSiembra: 's1' } as any;
    c.siembra = { _id: 's1', calculoFenologico: { registroId: 'r1', estado: 'pendiente' } };
    return c;
  }
  it('al completar recupera la siembra y distribuye predicciones nuevas a los cuadros', async () => {
    const api = {
      estadoCalculoFenologico: jasmine
        .createSpy()
        .and.resolveTo({ registroId: 'r1', estado: 'completado', completadoEn: '2026-09-13T12:00:00Z' }),
      listarPorId: jasmine
        .createSpy()
        .and.resolveTo({
          _id: 's1',
          ultimaPrediccion: { _id: 'nueva' },
          ultimaPrediccionRiego: [{ cantidad: 2 }],
          registrosFenologicos: [{ id: 'r1' }],
        }),
    };
    const c = panel(api);
    await c.revisarCalculoFenologico();
    expect(c.siembra?.ultimaPrediccion?._id).toBe('nueva');
    expect(c.lote?.siembra?.ultimaPrediccion?._id).toBe('nueva');
    expect(c.siembra?.calculoFenologico?.estado).toBe('completado');
    expect(c.siguiendoCalculoFenologico).toBe(false);
    expect(api.listarPorId).toHaveBeenCalledTimes(1);
  });
  it('no reemplaza el lote visible cuando termina una consulta anterior', async () => {
    let finish!: (v: any) => void;
    const api = {
      estadoCalculoFenologico: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      listarPorId: jasmine.createSpy(),
    };
    const c = panel(api);
    const pending = c.revisarCalculoFenologico();
    c.ngOnDestroy();
    finish({ registroId: 'r1', estado: 'completado' });
    await pending;
    expect(api.listarPorId).not.toHaveBeenCalled();
  });
});
