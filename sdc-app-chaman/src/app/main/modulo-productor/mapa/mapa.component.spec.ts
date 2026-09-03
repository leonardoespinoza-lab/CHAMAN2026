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

  it('mantiene verde el mapa y presenta seguimiento cuando el indice sanitario no es operativo', () => {
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
    expect(component.loteEnfermedadNivel(lote)).toBe('En seguimiento');
    expect(component.loteEnfermedadPercent(lote)).toBe(0);
    expect(component.loteEnfermedadResumen(lote)).toContain('1 modelo en seguimiento');
  });

  it('no reemplaza un lote seleccionado por otro lote con el mismo nombre', () => {
    component.lotes = [
      { _id: 'lote-a', nombre: 'Duplicado' },
      { _id: 'lote-b', nombre: 'Duplicado' },
    ] as any;

    expect((component as any).buscarLote('lote-inexistente', 'Duplicado')).toBeUndefined();
    expect((component as any).buscarLote('lote-b', 'Duplicado')).toBe(component.lotes[1]);
  });

  it('rechaza una siembra poblada que pertenece a otro lote', () => {
    const lote = {
      _id: 'lote-a',
      idSiembra: 'siembra-a',
      siembra: {
        _id: 'siembra-a',
        idLote: 'lote-b',
        fechaSiembra: '2026-05-01T03:00:00.000Z',
        semilla: { cultivo: 'Cebada', variedad: 'ANDREIA' },
      },
    } as any;

    expect(component.loteCultivo(lote)).toBe('Sin siembra');
    expect(component.loteFechaSiembra(lote)).toBe('No cargada');
    expect(component.loteRindeResumen(lote)).toBe('Sin siembra');
  });

  it('muestra solo rendimiento cosechado y no fabrica una estimacion local', () => {
    const base = {
      _id: 'lote-a',
      idSiembra: 'siembra-a',
      siembra: {
        _id: 'siembra-a',
        idLote: 'lote-a',
        semilla: { cultivo: 'Cebada', variedad: 'ANDREIA' },
      },
    } as any;

    expect(component.loteRindeResumen(base)).toBe('Sin dato consolidado');
    expect(
      component.loteRindeResumen({
        ...base,
        siembra: { ...base.siembra, rendimientoObtenidoKgHaSeco: 4876 },
      })
    ).toContain('4.876 kg/ha cosechado');
  });

  it('conserva un NDVI operativo igual a cero', () => {
    expect(component.loteNdviResumen({ ndvi: 0 } as any)).toBe('NDVI 0,000');
  });
});
