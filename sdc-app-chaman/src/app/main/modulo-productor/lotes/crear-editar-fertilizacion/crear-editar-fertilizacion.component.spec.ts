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
});
