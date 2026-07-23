import { DrawerListadoSiembrasComponent } from './drawer-listado-siembras.component';

describe('DrawerListadoSiembrasComponent', () => {
  it('cierra la suscripcion al destruir el drawer', () => {
    const component = new DrawerListadoSiembrasComponent(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const subscription = {
      unsubscribe: jasmine.createSpy('unsubscribe'),
    };
    (component as any).siembras$ = subscription;

    component.ngOnDestroy();

    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect((component as any).siembras$).toBeUndefined();
  });
});
