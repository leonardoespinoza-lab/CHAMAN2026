import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CrearEditarFumigacionComponent } from './crear-editar-fumigacion.component';

describe('CrearEditarFumigacionComponent', () => {
  let component: CrearEditarFumigacionComponent;
  let fixture: ComponentFixture<CrearEditarFumigacionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CrearEditarFumigacionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CrearEditarFumigacionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('vuelve al manejo del lote cuando la fumigacion se abrio desde el detalle', () => {
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
