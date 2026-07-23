import { CardMapaComponent } from './card-mapa.component';

describe('CardMapaComponent', () => {
  it('desvincula y dispone OpenLayers al destruir la tarjeta', () => {
    const component = new CardMapaComponent({} as any);
    const map = {
      setTarget: jasmine.createSpy('setTarget'),
      dispose: jasmine.createSpy('dispose'),
    };
    component.map = map as any;

    component.ngOnDestroy();

    expect(map.setTarget).toHaveBeenCalledOnceWith(undefined);
    expect(map.dispose).toHaveBeenCalledTimes(1);
    expect(component.map).toBeUndefined();
  });
});
