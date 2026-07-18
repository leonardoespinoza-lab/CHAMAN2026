import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MapaComponent } from './mapa.component';

describe('MapaComponent', () => {
  let component: MapaComponent;
  let fixture: ComponentFixture<MapaComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapaComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MapaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('mantiene verde un lote sin indice sanitario operativo', () => {
    const lote = {
      ubicacion: { superficie: 12 },
      siembra: {
        ultimaPrediccion: {
          fecha: new Date().toISOString(),
          enfermedades: [
            {
              enfermedad: 'Roya Amarilla/Estriada',
              resultado: 0,
              estado: 'calculado',
              modelo: { version: 5, validacion: 'experimental' },
              calidadDatos: { nivel: 'baja' },
            },
          ],
        },
      },
    } as any;

    component.lotes = [lote];
    (component as any).calcularEnfermedades();

    expect(component.enfermedades.cantVerde).toBe(1);
    expect(component.enfermedades.cantAmarillo).toBe(0);
    expect(component.enfermedades.cantSinDatos).toBe(1);
    expect(lote.colorEnfermedad).toContain('34, 197, 94');
    expect(component.loteEnfermedadNivel(lote)).toBe('Riesgo bajo');
    expect(component.loteEnfermedadPercent(lote)).toBe(0);
    expect(component.loteEnfermedadResumen(lote)).toContain('0%');
  });
});
