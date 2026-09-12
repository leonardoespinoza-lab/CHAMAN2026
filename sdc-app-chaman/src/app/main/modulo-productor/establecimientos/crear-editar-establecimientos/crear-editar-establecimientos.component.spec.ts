import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CrearEditarEstablecimientosComponent } from './crear-editar-establecimientos.component';

describe('CrearEditarEstablecimientosComponent', () => {
  let component: CrearEditarEstablecimientosComponent;
  let fixture: ComponentFixture<CrearEditarEstablecimientosComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CrearEditarEstablecimientosComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CrearEditarEstablecimientosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

describe('Alta web: cartera propia o productor asesorado', () => {
  function editor(nivel = 'Asesor', rol = 'Admin') {
    const helper: any = { permiso: { nivel, rol }, notifWarn: jasmine.createSpy() };
    const api: any = { crear: jasmine.createSpy() };
    const c = new CrearEditarEstablecimientosComponent({} as any, {} as any, api,
      helper, {} as any, {} as any, {} as any);
    (c as any).createForm();
    c.form!.get('nombre')!.setValue('Campo');
    return { c, api };
  }
  it('requiere productor hasta que el asesor elija explícitamente su cartera propia', () => {
    const { c } = editor();
    expect(c.form!.valid).toBeFalse();
    c.form!.get('idProductor')!.setValue('p1');
    expect(c.form!.valid).toBeTrue();
    c.form!.get('carteraPropiaAsesor')!.setValue(true);
    c.cambiarCarteraPropia();
    expect(c.form!.get('idProductor')!.value).toBeNull();
    expect(c.form!.valid).toBeTrue();
    expect((c as any).getData()).toEqual(jasmine.objectContaining({ carteraPropiaAsesor: true, idProductor: null }));
    c.form!.get('carteraPropiaAsesor')!.setValue(false);
    c.cambiarCarteraPropia();
    expect(c.form!.valid).toBeFalse();
  });
  it('no habilita cartera propia al administrador global, productor ni asesor de lectura', () => {
    for (const [nivel, rol] of [['Admin', 'Admin'], ['Productor', 'Admin'], ['Asesor', 'Lectura']]) {
      const { c } = editor(nivel, rol);
      expect(c.puedeElegirCarteraPropia).toBeFalse();
      expect(c.form!.contains('carteraPropiaAsesor')).toBeFalse();
    }
  });
  it('no envía altas inválidas', async () => {
    const { c, api } = editor();
    await c.guardar();
    expect(api.crear).not.toHaveBeenCalled();
  });
  it('la edición no permite cambiar la titularidad guardada', () => {
    const { c } = editor();
    c.establecimiento = { _id: 'e1', nombre: 'Campo', carteraPropiaAsesor: true };
    (c as any).createForm();
    expect(c.puedeElegirCarteraPropia).toBeFalse();
    expect(c.form!.contains('carteraPropiaAsesor')).toBeFalse();
  });
});
