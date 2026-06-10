import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CrearEditarLoteComponent } from './crear-editar-lote.component';

describe('CrearEditarLoteComponent', () => {
  let component: CrearEditarLoteComponent;
  let fixture: ComponentFixture<CrearEditarLoteComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CrearEditarLoteComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CrearEditarLoteComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
