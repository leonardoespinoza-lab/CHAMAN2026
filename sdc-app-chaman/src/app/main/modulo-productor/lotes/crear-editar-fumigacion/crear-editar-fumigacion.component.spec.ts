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
});
