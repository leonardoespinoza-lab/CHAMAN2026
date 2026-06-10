import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CrearEditarSiembraComponent } from './crear-editar-siembra.component';

describe('CrearEditarSiembraComponent', () => {
  let component: CrearEditarSiembraComponent;
  let fixture: ComponentFixture<CrearEditarSiembraComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CrearEditarSiembraComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CrearEditarSiembraComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
