import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DetallesLoteComponent } from './detalles-lote.component';

describe('DetallesLoteComponent', () => {
  let component: DetallesLoteComponent;
  let fixture: ComponentFixture<DetallesLoteComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetallesLoteComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DetallesLoteComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
