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
});
