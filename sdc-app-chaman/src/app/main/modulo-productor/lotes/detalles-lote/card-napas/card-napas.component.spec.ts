import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { INapaSeguimientoLote, ISeguimientoNapaSensorLote } from 'modelos/src';
import { NapasService } from '../../../../../auxiliares/http/napas.service';
import { CardNapasComponent } from './card-napas.component';

describe('CardNapasComponent', () => {
  const directa = (nivelM: number, lote = 'Lote 1'): ISeguimientoNapaSensorLote => ({
    tipo: 'sensor_lote',
    fechaConsulta: '2026-08-15T18:45:00.000Z',
    mensaje: 'Medicion directa del sensor instalado en este lote.',
    nivelM,
    unidad: 'm',
    referencia: 'nivel_terreno',
    fechaMedicion: '2026-08-15T18:30:00.000Z',
    frescura: 'actual',
    edadMinutos: 15,
    columnaAguaM: 3.526,
    profundidadInstalacionM: 6,
    distanciaKm: 0,
    origen: {
      fuente: 'Milesight/LoRaWAN',
      servicio: 'nivel-napa',
      lote,
      fCnt: 256,
      decoderVersion: '1.2.0',
      conversionModel: 'lineal-4-20ma-v1',
    },
  });

  it('descarta la respuesta atrasada del lote anterior', async () => {
    let resolveA!: (value: INapaSeguimientoLote) => void;
    let resolveB!: (value: INapaSeguimientoLote) => void;
    const requestA = new Promise<INapaSeguimientoLote>((resolve) => (resolveA = resolve));
    const requestB = new Promise<INapaSeguimientoLote>((resolve) => (resolveB = resolve));
    const service = {
      seguimientoLote: jasmine.createSpy().and.callFake((id: string) => (id === 'lote-a' ? requestA : requestB)),
    };
    const component = new CardNapasComponent(service as any);

    component.lote = { _id: 'lote-a' } as any;
    component.ngOnChanges({ lote: {} as any });
    component.lote = { _id: 'lote-b' } as any;
    component.ngOnChanges({ lote: {} as any });

    resolveB(directa(2.553, 'Lote B'));
    await requestB;
    await Promise.resolve();
    expect(component.seguimiento?.nivelM).toBe(2.553);

    resolveA(directa(9.999, 'Lote A'));
    await requestA;
    await Promise.resolve();
    expect(component.seguimiento?.nivelM).toBe(2.553);
    expect(component.origenLabel).toBe('Milesight/LoRaWAN');
  });

  it('muestra valor, fecha, frescura, columna y origen sin desbordar en movil', fakeAsync(() => {
    const napas = {
      seguimientoLote: jasmine.createSpy().and.resolveTo(directa(2.474)),
    };
    TestBed.configureTestingModule({
      imports: [CardNapasComponent],
      providers: [{ provide: NapasService, useValue: napas }],
    });
    const fixture = TestBed.createComponent(CardNapasComponent);
    fixture.componentInstance.lote = { _id: 'lote-1' } as any;
    fixture.componentInstance.ngOnChanges({ lote: {} as any });
    tick();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    host.style.display = 'block';
    host.style.width = '320px';
    fixture.detectChanges();
    const text = host.textContent || '';

    expect(text).toContain('2,474 m');
    expect(text).toContain('3,526 m');
    expect(text).toContain('Hace 15 min');
    expect(text).toContain('Milesight/LoRaWAN');
    expect(host.querySelector('.napas-kpis')).not.toBeNull();
    expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth + 1);
  }));

  it('advierte visualmente cuando la lectura propia esta demorada', () => {
    const component = new CardNapasComponent({} as any);
    component.seguimiento = {
      ...directa(2.474),
      frescura: 'demorada',
      edadMinutos: 180,
      mensaje: 'Medicion directa del lote demorada.',
    };

    expect(component.calidadLabel).toBe('Dato demorado');
    expect(component.frescuraLabel).toBe('Hace 3 h');
  });
});
