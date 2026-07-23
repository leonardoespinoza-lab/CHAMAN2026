import { LoginComponent } from './login.component';
import { NivelPermiso } from 'modelos/src';

describe('LoginComponent', () => {
  const crearComponente = (permisos: any[]) => {
    const helper: any = {
      user: { permisos },
      setPermiso: jasmine.createSpy('setPermiso'),
      setNumeroPermiso: jasmine.createSpy('setNumeroPermiso'),
    };
    return {
      component: new LoginComponent({} as any, {} as any, helper),
      helper,
    };
  };

  const rutas: Record<NivelPermiso, string> = {
    Admin: '/dashboard-admin',
    Tenant: '/dashboard-tenant',
    Quimica: '/dashboard-quimica',
    Distribuidor: '/dashboard-distribuidor',
    Asesor: '/dashboard-distribuidor',
    Productor: '/mapa',
    Establecimiento: '/mapa',
  };

  Object.entries(rutas).forEach(([nivel, ruta]) => {
    it(`abre la ruta inicial canonica de ${nivel}`, () => {
      const { component } = crearComponente([
        { nivel, rol: 'Admin' },
      ]);

      expect((component as any).getRutaInicial()).toBe(ruta);
    });
  });

  it('prioriza Asesor sobre Productor y abre su tablero de gestion', () => {
    const { component, helper } = crearComponente([
      { nivel: 'Productor', rol: 'Admin', idProductor: 'p-1' },
      { nivel: 'Asesor', rol: 'Admin', idAsesor: 'a-1' },
    ]);

    expect((component as any).getRutaInicial()).toBe('/dashboard-distribuidor');
    expect(helper.setNumeroPermiso).toHaveBeenCalledWith(1);
  });

  it('mantiene fuera del dashboard-admin a un Admin de lectura', () => {
    const { component } = crearComponente([
      { nivel: 'Admin', rol: 'Lectura' },
    ]);

    expect((component as any).getRutaInicial()).toBe('/mapa');
  });
});
