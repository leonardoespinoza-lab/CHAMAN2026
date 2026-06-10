import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DetallesDispositivoComponent } from './detalles-dispositivo.component';

describe('DetallesDispositivoComponent', () => {
  let component: DetallesDispositivoComponent;
  let fixture: ComponentFixture<DetallesDispositivoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetallesDispositivoComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DetallesDispositivoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
