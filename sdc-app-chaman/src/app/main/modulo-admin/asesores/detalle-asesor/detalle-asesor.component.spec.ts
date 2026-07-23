import { DetalleAsesorComponent } from './detalle-asesor.component';

describe('DetalleAsesorComponent', () => {
  it('expone la ficha administrativa de auditoria', () => {
    expect(DetalleAsesorComponent).toBeTruthy();
  });

  it('expone una accion administrativa para archivar lotes preservando historial', () => {
    expect(DetalleAsesorComponent.prototype.archivarLote).toBeTruthy();
  });
});
