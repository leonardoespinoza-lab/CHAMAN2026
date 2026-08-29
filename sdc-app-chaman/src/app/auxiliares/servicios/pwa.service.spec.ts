import {
  debeAplicarActualizacionAutomaticamente,
  PwaService,
} from './pwa.service';

describe('PwaService', () => {
  it('aplica automaticamente las actualizaciones solo en Testing', () => {
    expect(debeAplicarActualizacionAutomaticamente('Test', 'testing.example')).toBeTrue();
    expect(
      debeAplicarActualizacionAutomaticamente(
        'Local',
        'testing-web-testing-dc8e.up.railway.app'
      )
    ).toBeTrue();
    expect(debeAplicarActualizacionAutomaticamente('Production', 'app.chamanagro.ar')).toBeFalse();
  });

  const createService = () => {
    let confirmation: any;
    const swUpdate = {
      isEnabled: true,
      checkForUpdate: jasmine.createSpy('checkForUpdate').and.resolveTo(true),
      activateUpdate: jasmine.createSpy('activateUpdate').and.resolveTo(true),
    };
    const translate = {
      instant: jasmine.createSpy('instant').and.callFake((value: string) => value),
    };
    const confirmationService = {
      confirm: jasmine.createSpy('confirm').and.callFake((value: any) => {
        confirmation = value;
      }),
    };
    return {
      service: new PwaService(swUpdate as any, translate as any, confirmationService as any),
      swUpdate,
      confirmationService,
      getConfirmation: () => confirmation,
    };
  };

  it('continua comprobando versiones cuando el usuario posterga la actualizacion', async () => {
    const { service, swUpdate, confirmationService, getConfirmation } = createService();

    await (service as any).checkVersion();
    getConfirmation().reject();
    await (service as any).checkVersion();

    expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(2);
    expect(confirmationService.confirm).toHaveBeenCalledTimes(2);
  });

  it('evita abrir dos confirmaciones simultaneas para la misma actualizacion', async () => {
    const { service, swUpdate, confirmationService } = createService();

    await (service as any).checkVersion();
    await (service as any).checkVersion();

    expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(1);
    expect(confirmationService.confirm).toHaveBeenCalledTimes(1);
  });
});
