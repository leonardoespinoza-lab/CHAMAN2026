import { IDispositivo } from 'modelos/src';

import { DrawerDispositivosComponent } from './drawer-dispositivos.component';

describe('DrawerDispositivosComponent', () => {
  const dispositivo = {
    _id: 'device-sentek',
    deveui: '24E124454E358520',
    nombre: 'Controlador Gilardoni',
    tipo: 'Sensor de Humedad de Suelo',
    configuracionLecturas: {
      perfilSuelo: { profundidadesCm: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120] },
    },
  } as IDispositivo;

  it('mantiene alineados el periodo solicitado y el limite de tramas crudas', async () => {
    const historico = jasmine.createSpy('historico').and.resolveTo({ datos: [] });
    const rawHistory = jasmine.createSpy('rawHistory').and.resolveTo([]);
    const component = new DrawerDispositivosComponent({} as any, { historico } as any, { rawHistory } as any);
    component.dispositivo = dispositivo;
    component.esLanzaDeSuelo = true;
    component.historicoHasta = '2026-01-01T00:00:00.000Z';

    for (const [dias, limite] of [
      [1, 1000],
      [7, 4000],
      [30, 12000],
    ] as const) {
      await component.cambiarPeriodoHistorico(dias);
      expect(historico).toHaveBeenCalledWith('device-sentek', dias, 2500);
      expect(rawHistory).toHaveBeenCalledWith('24E124454E358520', dias, limite);
    }

    expect(component.diasHistorico).toBe(30);
    expect(component.historicoHasta).not.toBe('2026-01-01T00:00:00.000Z');
  });

  it('descarta una respuesta tardia de un periodo anterior', async () => {
    const resolvers = new Map<number, (frames: any[]) => void>();
    const component = new DrawerDispositivosComponent(
      {} as any,
      { historico: jasmine.createSpy().and.resolveTo({ datos: [] }) } as any,
      {
        rawHistory: jasmine
          .createSpy()
          .and.callFake(
            (_devEUI: string, dias?: number) => new Promise((resolve) => resolvers.set(dias ?? 7, resolve))
          ),
      } as any
    );
    component.dispositivo = dispositivo;
    component.esLanzaDeSuelo = true;

    const sieteDias = component.cambiarPeriodoHistorico(7);
    const treintaDias = component.cambiarPeriodoHistorico(30);
    resolvers.get(30)?.([{ id: 'periodo-actual' }]);
    await treintaDias;
    resolvers.get(7)?.([{ id: 'respuesta-vieja' }]);
    await sieteDias;

    expect(component.rawFrames.map((frame) => frame.id)).toEqual(['periodo-actual']);
    expect(component.diasHistorico).toBe(30);
  });
});
