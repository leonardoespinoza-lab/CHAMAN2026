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
