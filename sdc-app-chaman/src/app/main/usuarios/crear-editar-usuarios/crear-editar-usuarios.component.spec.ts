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

  it('no bloquea el alta de un asesor si la ubicacion se completa despues', () => {
    component.permisos.at(0).get('nivel')?.setValue('Asesor');
    component.cambioNivel(0, false);

    expect(component.form?.get('ubicacionProfesional.direccion')?.hasError('required')).toBeFalse();
    expect(component.form?.get('ubicacionProfesional.geojson')?.hasError('required')).toBeFalse();
  });

  it('muestra el perfil profesional solamente para un asesor', () => {
    component.permisos.at(0).get('nivel')?.setValue('Productor');
    component.cambioNivel(0, false);
    expect(component.esPerfilAsesor).toBeFalse();

    component.permisos.at(0).get('nivel')?.setValue('Asesor');
    component.cambioNivel(0, false);
    expect(component.esPerfilAsesor).toBeTrue();
  });

  it('normaliza el nivel Admin al unico rol operativo valido', () => {
    component.permisos.at(0).get('rol')?.setValue('Lectura');
    component.permisos.at(0).get('nivel')?.setValue('Admin');
    component.cambioNivel(0, false);

    expect(component.permisos.at(0).get('rol')?.value).toBe('Admin');
    expect(component.rolesParaNivel('Admin')).toEqual(['Admin']);
  });
});
