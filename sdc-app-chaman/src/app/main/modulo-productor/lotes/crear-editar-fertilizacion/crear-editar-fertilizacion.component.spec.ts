import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CrearEditarFertilizacionComponent } from './crear-editar-fertilizacion.component';

describe('CrearEditarFertilizacionComponent', () => {
  let component: CrearEditarFertilizacionComponent;
  let fixture: ComponentFixture<CrearEditarFertilizacionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CrearEditarFertilizacionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CrearEditarFertilizacionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('vuelve al manejo del lote cuando la fertilizacion se abrio desde el detalle', () => {
    const params = (component as any).paramsService;
    const router = (component as any).router;
    params.set('retornoManejoLoteId', 'lote-1');
    spyOn(router, 'navigate').and.resolveTo(true);

    component.volver();

    expect(router.navigate).toHaveBeenCalledWith(['lotes', 'detalles', 'lote-1'], {
      fragment: 'manejo-cultivo',
    });
    expect(params.get('retornoManejoLoteId')).toBeUndefined();
  });
});
