import { IDispositivo, ILote } from 'modelos/src';
import { CardDispositivosComponent } from './card-dispositivos.component';

describe('CardDispositivosComponent', () => {
  it('expone Sentek y Napa como dos servicios aunque compartan DevEUI', () => {
    const component = new CardDispositivosComponent({} as any, {} as any, {} as any);
    const controller: IDispositivo = {
      _id: 'controller-1',
      deveui: '24E124136D000001',
      nombre: 'Milesight UC511',
      tipo: 'Otro',
      sensores: ['Humedad Suelo Profundidad', 'Temperatura Suelo', 'Salinidad Suelo', 'Entrada Analógica', 'Napa'],
      configuracionLecturas: {
        perfilSuelo: {
          tipo: 'sonda_sentek_120cm',
          protocolo: 'SDI-12',
          niveles: 12,
          profundidadesCm: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120],
          variables: ['humedad_vwc', 'salinidad_vic', 'temperatura'],
        },
        entradaAnalogica: {
          canal: 1,
          tipoSenal: '4-20mA',
          variable: 'nivel_napa',
          entradaMinMa: 4,
          entradaMaxMa: 20,
          salidaMin: 0,
          salidaMax: 10,
          unidadSalida: 'm',
          profundidadInstalacionM: 6,
          longitudCableM: 10,
          tramoCableExteriorM: 4,
        },
      },
      ultimoReporte: {
        fecha: '2026-08-14T10:00:00.000Z',
        datos: {
          valores: {
            'Humedad Suelo Profundidad': [{ profundidad: 10, unidad: '%', valores: { actual: 22 } }],
            Napa: [
              {
                unidad: 'm',
                valores: { actual: 2.72, columnaAgua: 3.28, profundidadInstalacion: 6 },
              },
            ],
          },
        },
      },
    };
    component.lote = { dispositivos: [controller] } as ILote;

    component.ngOnChanges({ lote: {} as any });

    expect(component.dispositivos.length).toBe(2);
    const sentek = component.dispositivos.find((item) => item.nombre === 'Sonda de humedad de suelo Sentek')!;
    const napa = component.dispositivos.find((item) => item.nombre === 'Medidor de Napa')!;
    expect(component.esLanzaDeSuelo(sentek)).toBeTrue();
    expect(component.esMedidorNapa(sentek)).toBeFalse();
    expect(component.esMedidorNapa(napa)).toBeTrue();
    expect(component.getDeviceKey(sentek)).not.toBe(component.getDeviceKey(napa));
    expect(sentek.ultimoReporte?.datos?.valores.Napa).toBeUndefined();
    expect(napa.ultimoReporte?.datos?.valores['Humedad Suelo Profundidad']).toBeUndefined();
    expect(component.configuracionNapa(napa)?.profundidadInstalacionM).toBe(6);
  });

  it('no clasifica un Milesight generico como Sentek ni como Napa', () => {
    const component = new CardDispositivosComponent({} as any, {} as any, {} as any);
    component.lote = {
      dispositivos: [{ _id: 'controller-2', deveui: '24E124136D000002', nombre: 'Milesight UC511', tipo: 'Otro' }],
    } as ILote;

    component.ngOnChanges({ lote: {} as any });

    expect(component.dispositivos.length).toBe(1);
    expect(component.esLanzaDeSuelo(component.dispositivos[0])).toBeFalse();
    expect(component.esMedidorNapa(component.dispositivos[0])).toBeFalse();
  });
});
