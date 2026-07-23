import { AutocompleteDireccionComponent } from './autocomplete-direccion.component';

describe('AutocompleteDireccionComponent', () => {
  const crear = (resultados: string[] = ['SAN MARTIN 1000, Capital, Cordoba']) => {
    const geonode = {
      direcciones: jasmine.createSpy().and.resolveTo({ resultados }),
      geocode: jasmine.createSpy().and.resolveTo({ lat: -31.416, lng: -64.183 }),
      reverse: jasmine.createSpy().and.resolveTo({ direccion: 'Cordoba, Cordoba' }),
    };
    const helper = {
      getSearchCoordinates: jasmine.createSpy().and.resolveTo({ lat: -31.42, lng: -64.18 }),
    };
    return {
      component: new AutocompleteDireccionComponent(geonode as any, helper as any),
      geonode,
      helper,
    };
  };

  it('busca direcciones y reutiliza una sola ubicacion de referencia', async () => {
    const { component, helper, geonode } = crear();

    await component.onSearch({ query: 'San Martin 1000' } as any);
    await component.onSearch({ query: 'San Martin 1200' } as any);

    expect(component.direccionesSugeridas.length).toBe(1);
    expect(helper.getSearchCoordinates).toHaveBeenCalledTimes(1);
    expect(geonode.direcciones).toHaveBeenCalledTimes(2);
  });

  it('explica como continuar cuando no hay coincidencias', async () => {
    const { component } = crear([]);

    await component.onSearch({ query: 'Camino rural sin altura' } as any);

    expect(component.searchMessage).toContain('marca el punto');
  });

  it('limpia el valor y avisa al formulario padre', () => {
    const { component } = crear();
    component.direccionInput = 'Direccion anterior';
    spyOn(component.direccionClear, 'emit');

    component.onClear();

    expect(component.direccionInput).toBe('');
    expect(component.direccionClear.emit).toHaveBeenCalled();
  });
});
