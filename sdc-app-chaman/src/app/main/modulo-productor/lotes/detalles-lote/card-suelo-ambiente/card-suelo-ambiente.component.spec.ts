import { SimpleChange } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoteService } from '../../../../../auxiliares/http/lote.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { CardSueloAmbienteComponent } from './card-suelo-ambiente.component';

describe('CardSueloAmbienteComponent request lifecycle', () => {
  let loteService: {
    sueloAmbiente: jasmine.Spy;
    reprocesarSueloAmbiente: jasmine.Spy;
  };
  let component: CardSueloAmbienteComponent;

  beforeEach(() => {
    loteService = {
      sueloAmbiente: jasmine.createSpy('sueloAmbiente'),
      reprocesarSueloAmbiente: jasmine.createSpy('reprocesarSueloAmbiente'),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: LoteService, useValue: loteService },
        { provide: HelperService, useValue: { notifError: jasmine.createSpy('notifError') } },
      ],
    });
    component = TestBed.runInInjectionContext(() => new CardSueloAmbienteComponent());
  });

  afterEach(() => component.ngOnDestroy());

  it('does not reload when only the lot object reference changes', async () => {
    loteService.sueloAmbiente.and.resolveTo({ status: 'ready' });
    const first = lot('lot-1', -34.1);
    component.lote = first;
    component.ngOnChanges({ lote: new SimpleChange(undefined, first, true) });
    await flushPromises();

    const refreshedReference = { ...first, nombre: 'Lote actualizado' };
    component.lote = refreshedReference;
    component.ngOnChanges({ lote: new SimpleChange(first, refreshedReference, false) });
    await flushPromises();

    expect(loteService.sueloAmbiente).toHaveBeenCalledTimes(1);
  });

  it('ignores a response from a lot that is no longer active', async () => {
    const firstRequest = deferred<any>();
    const secondRequest = deferred<any>();
    loteService.sueloAmbiente.and.returnValues(firstRequest.promise, secondRequest.promise);

    const first = lot('lot-1', -34.1);
    component.lote = first;
    component.ngOnChanges({ lote: new SimpleChange(undefined, first, true) });

    const second = lot('lot-2', -35.2);
    component.lote = second;
    component.ngOnChanges({ lote: new SimpleChange(first, second, false) });

    firstRequest.resolve({ status: 'ready', loteId: 'lot-1' });
    await flushPromises();
    expect(component.assessment).toBeUndefined();

    secondRequest.resolve({ status: 'ready', loteId: 'lot-2' });
    await flushPromises();
    expect(component.assessment?.loteId).toBe('lot-2');
  });

  it('clears state and polling when the lot becomes unavailable', async () => {
    loteService.sueloAmbiente.and.resolveTo({ status: 'processing' });
    const current = lot('lot-1', -34.1);
    component.lote = current;
    component.ngOnChanges({ lote: new SimpleChange(undefined, current, true) });
    await flushPromises();

    component.lote = undefined;
    component.ngOnChanges({ lote: new SimpleChange(current, undefined, false) });

    expect(component.assessment).toBeUndefined();
    expect(component.loading).toBeFalse();
  });
});

function lot(id: string, longitude: number): any {
  return {
    _id: id,
    ubicacion: {
      geojson: {
        type: 'Polygon',
        coordinates: [
          [
            [longitude, -32],
            [longitude + 0.01, -32],
            [longitude, -31.99],
            [longitude, -32],
          ],
        ],
      },
    },
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
