import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CrearEditarUsuariosComponent } from './crear-editar-usuarios.component';

describe('CrearEditarUsuariosComponent', () => {
  let component: CrearEditarUsuariosComponent;
  let fixture: ComponentFixture<CrearEditarUsuariosComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CrearEditarUsuariosComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CrearEditarUsuariosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
