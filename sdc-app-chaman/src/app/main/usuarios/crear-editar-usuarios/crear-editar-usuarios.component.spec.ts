import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { LoginService } from '../../../auxiliares/http/login.service';
import { UsuarioService } from '../../../auxiliares/http/usuario.service';
import { HelperService } from '../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../auxiliares/servicios/params.service';

import { CrearEditarUsuariosComponent } from './crear-editar-usuarios.component';

describe('CrearEditarUsuariosComponent', () => {
  let component: CrearEditarUsuariosComponent;
  let fixture: ComponentFixture<CrearEditarUsuariosComponent>;
  let login: { esAdmin: boolean; esQuimica: boolean; esTenant: boolean };
  let helper: { permiso: any; notifError: jasmine.Spy; notifSuccess: jasmine.Spy };
  let crear: jasmine.Spy;

  beforeEach(async () => {
    login = { esAdmin: true, esQuimica: false, esTenant: false };
    helper = {
      permiso: { nivel: 'Admin', rol: 'Admin' },
      notifError: jasmine.createSpy('notifError'),
      notifSuccess: jasmine.createSpy('notifSuccess'),
    };
    crear = jasmine.createSpy('crear').and.resolveTo({ _id: 'usuario-prueba' });
    await TestBed.configureTestingModule({
      imports: [CrearEditarUsuariosComponent],
      providers: [
        { provide: LoginService, useValue: login },
        { provide: HelperService, useValue: helper },
        { provide: UsuarioService, useValue: { crear } },
        { provide: ParamsService, useValue: { get: () => undefined } },
        { provide: ListadosService, useValue: {
          subscribe: () => of({ datos: [] }),
          getLastValue: () => Promise.resolve(),
          createEntityItem: jasmine.createSpy('createEntityItem'),
        } },
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(CrearEditarUsuariosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
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

  function seleccionarAsesor() {
    component.permisos.at(0).get('nivel')?.setValue('Asesor');
    component.cambioNivel(0);
  }

  it('permite guardar un asesor independiente sin compania ni cartera inicial', async () => {
    seleccionarAsesor();
    component.form?.patchValue({ username: 'asesor.prueba', password: 'SoloPrueba1' });
    spyOn(component, 'volver');

    expect(component.permisos.at(0).get('idQuimica')?.hasError('required')).toBeFalse();
    expect(component.form?.valid).toBeTrue();
    await component.guardar();

    expect(crear).toHaveBeenCalledTimes(1);
    const permiso = crear.calls.mostRecent().args[0].permisos[0];
    expect(permiso.nivel).toBe('Asesor');
    expect(permiso.idQuimica).toBeFalsy();
    expect(permiso.idDistribuidor).toBeFalsy();
    expect(permiso.idEstablecimientos).toEqual([]);
    expect(permiso.idLotes).toEqual([]);
    expect(helper.notifError).not.toHaveBeenCalled();
  });

  it('no asigna la unica compania disponible al crear o refrescar un asesor', () => {
    component.quimicas = [{ _id: 'compania-unica', nombre: 'Compania de prueba' }] as any;
    seleccionarAsesor();
    component.cambioNivel(0, false); // El listado asincrono refresca los validadores.
    expect(component.permisos.at(0).get('idQuimica')?.value).toBeFalsy();
  });

  it('conserva una compania elegida o existente, pero permite limpiar la seleccion', () => {
    seleccionarAsesor();
    component.quimicas = [{ _id: 'compania-elegida', nombre: 'Compania elegida' }] as any;
    const compania = component.permisos.at(0).get('idQuimica');
    compania?.setValue('compania-elegida');
    component.cambioNivel(0, false);
    expect(compania?.value).toBe('compania-elegida');
    expect((component as any).getData().permisos[0].idQuimica).toBe('compania-elegida');

    compania?.setValue(null);
    component.cambioNivel(0, false);
    expect(compania?.value).toBeNull();
    expect(compania?.valid).toBeTrue();
  });

  it('mantiene la compania de la sesion cuando el alta la realiza una compania', () => {
    login.esAdmin = false;
    login.esQuimica = true;
    helper.permiso = { nivel: 'Quimica', rol: 'Admin', idQuimica: 'compania-sesion' };
    seleccionarAsesor();
    expect(component.permisos.at(0).get('idQuimica')?.value).toBe('compania-sesion');
    component.permisos.at(0).get('idQuimica')?.setValue(null);
    component.cambioNivel(0, false);
    expect(component.permisos.at(0).get('idQuimica')?.value).toBe('compania-sesion');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('p-select[formControlName="idQuimica"]')).toBeNull();
  });

  it('no exige compania ni borra el tenant en un asesor de tenant', () => {
    login.esAdmin = false;
    login.esTenant = true;
    helper.permiso = { nivel: 'Tenant', rol: 'Admin', idTenant: 'tenant-sesion' };
    seleccionarAsesor();
    const permiso = (component as any).getData().permisos[0];
    expect(permiso.idTenant).toBe('tenant-sesion');
    expect(permiso.idQuimica).toBeFalsy();
    expect(component.permisos.at(0).get('idQuimica')?.valid).toBeTrue();
  });

  it('mantiene la compania obligatoria para el nivel Compania, no para Asesor', () => {
    component.permisos.at(0).get('nivel')?.setValue('Quimica');
    component.cambioNivel(0);
    expect(component.permisos.at(0).get('idQuimica')?.hasError('required')).toBeTrue();
    seleccionarAsesor();
    expect(component.permisos.at(0).get('idQuimica')?.hasError('required')).toBeFalse();
  });

  it('identifica la compania opcional y permite limpiar el selector del Admin', () => {
    seleccionarAsesor();
    component.quimicas = [{ _id: 'compania-elegida', nombre: 'Compania elegida' }] as any;
    component.permisos.at(0).get('idQuimica')?.setValue('compania-elegida');
    component.tabValue = 1;
    fixture.detectChanges();
    const selector = fixture.nativeElement.querySelector('p-select[formControlName="idQuimica"]');
    expect(selector).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Compañía (opcional)');
    expect(fixture.nativeElement.textContent).toContain('asesor independiente');
    const limpiar = selector.querySelector('.p-select-clear-icon');
    expect(limpiar).not.toBeNull();
    limpiar.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    component.cambioNivel(0, false);
    expect(component.permisos.at(0).get('idQuimica')?.value).toBeNull();
  });
});
