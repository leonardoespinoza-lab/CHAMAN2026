import { ListadoAlertasComponent } from './listado-alertas.component';

describe('ListadoAlertasComponent', () => {
  let component: ListadoAlertasComponent;

  beforeEach(() => {
    component = new ListadoAlertasComponent({} as any, {} as any, {} as any, {} as any);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('muestra el indice cientifico del reporte antes que la prioridad operativa', () => {
    const alerta = {
      prioridad: 75,
      reportes: [{ posibilidadPct: 68, fechaCritica: '2026-07-17' }],
    };

    expect(component.valorRiesgo(alerta)).toBe(68);
    expect(component.prioridadOperativa(alerta)).toBe(75);
  });

  it('preserva el dia local de una fecha critica sin corrimiento UTC', () => {
    const texto = component.fechaDiaTexto('2026-07-17');

    expect(texto).toContain('17/07/2026');
  });

  it('respeta un indice cero y no lo reemplaza por la prioridad', () => {
    const alerta = {
      prioridad: 75,
      reportes: [{ posibilidadPct: 0 }],
    };

    expect(component.valorRiesgo(alerta)).toBe(0);
    expect(component.reporteRiesgo(alerta.reportes[0], alerta)).toBe(0);
  });

  it('excluye eventos finalizados del contador de alta prioridad', () => {
    component.data = [
      { activa: true, severidad: 'alta', estadoActual: 'Nueva' },
      { activa: false, severidad: 'alta', estadoActual: 'Finalizada' },
      { activa: true, severidad: 'media', estadoActual: 'Nueva' },
    ] as any;

    expect(component.resumen().activas).toBe(2);
    expect(component.resumen().alta).toBe(1);
  });

  it('no presenta un evento cerrado como atencion prioritaria', () => {
    component.data = [
      { activa: false, severidad: 'critica', estadoActual: 'Finalizada', prioridad: 98 },
      { activa: false, severidad: 'alta', estadoActual: 'Tratada', prioridad: 72 },
    ] as any;

    expect(component.alertaPrincipal()).toBeUndefined();
  });

  it('elige como atencion prioritaria solo el evento activo de mayor severidad', () => {
    component.data = [
      { _id: 'cerrada', activa: false, severidad: 'critica', estadoActual: 'Finalizada', prioridad: 99 },
      { _id: 'media', activa: true, severidad: 'media', estadoActual: 'Nueva', prioridad: 52 },
      { _id: 'alta', activa: true, severidad: 'alta', estadoActual: 'Nueva', prioridad: 74 },
    ] as any;

    expect(component.alertaPrincipal()?._id).toBe('alta');
  });
});
