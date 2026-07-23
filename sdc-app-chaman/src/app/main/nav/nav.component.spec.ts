import { IPermiso, NivelPermiso } from 'modelos/src';
import { NavComponent } from './nav.component';

describe('NavComponent access matrix', () => {
  const crearComponente = (permiso: IPermiso) => {
    const helper: any = {
      permiso,
      numeroPermiso: 0,
      user: {
        username: 'usuario.prueba',
        datosPersonales: { nombre: 'Asesor de prueba' },
        permisos: [permiso],
      },
      setPermiso: jasmine.createSpy('setPermiso'),
      setNumeroPermiso: jasmine.createSpy('setNumeroPermiso'),
    };
    const login: any = {
      resetPermisos: jasmine.createSpy('resetPermisos').and.callFake(() => {
        login.esAdmin = false;
        login.esTenant = false;
        login.esQuimica = false;
        login.esDistribuidor = false;
        login.esAsesor = false;
        login.esProductor = false;
        login.esEstablecimiento = false;
      }),
    };
    const router: any = {
      url: '/mapa',
      navigateByUrl: jasmine
        .createSpy('navigateByUrl')
        .and.resolveTo(true),
    };
    const component = new NavComponent(
      {} as any,
      helper,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      router,
      {} as any,
      {} as any,
      {} as any,
      login,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
    component.permisoSeleccionado = permiso;
    (component as any).checkPermisos();
    return { component, helper, login, router };
  };

  const flags: Record<NivelPermiso, string> = {
    Admin: 'esAdmin',
    Tenant: 'esTenant',
    Quimica: 'esQuimica',
    Distribuidor: 'esDistribuidor',
    Asesor: 'esAsesor',
    Productor: 'esProductor',
    Establecimiento: 'esEstablecimiento',
  };

  Object.entries(flags).forEach(([nivel, flag]) => {
    it(`clasifica y expone el menu de ${nivel}`, () => {
      const { component, login } = crearComponente({
        nivel: nivel as NivelPermiso,
        rol: 'Admin',
      });

      expect(component.esNivel(nivel as NivelPermiso)).toBeTrue();
      expect(login[flag]).toBeTrue();
    });
  });

  it('el Asesor tiene menu principal y vuelve a su dashboard consolidado', () => {
    const { component, router } = crearComponente({
      nivel: 'Asesor',
      rol: 'Admin',
      idAsesor: 'asesor-1',
    });

    expect(component.esNivel('Distribuidor', 'Asesor')).toBeTrue();
    expect(component.nombreAlcance()).toBe('Asesor de prueba');

    component.irInicio();

    expect(router.navigateByUrl).toHaveBeenCalledWith(
      '/dashboard-distribuidor'
    );
  });

  it('no etiqueta al Asesor como Distribuidor', () => {
    const { component } = crearComponente({
      nivel: 'Asesor',
      rol: 'Admin',
      idAsesor: 'asesor-1',
    });

    expect(component.descripcionAlcance()).toBe('Asesor - Admin');
    expect(component.nombrePermiso(component.permisoSeleccionado)).toBe(
      'Asesor de prueba'
    );
  });
});
