import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CrearEditarCosechaComponent } from './crear-editar-cosecha.component';

describe('CrearEditarCosechaComponent', () => {
  let component: CrearEditarCosechaComponent;
  let fixture: ComponentFixture<CrearEditarCosechaComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CrearEditarCosechaComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CrearEditarCosechaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
