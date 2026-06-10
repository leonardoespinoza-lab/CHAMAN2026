import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CardDetallesReporteLanzaComponent } from './card-detalles-reporte-lanza.component';

describe('CardDetallesReporteLanzaComponent', () => {
  let component: CardDetallesReporteLanzaComponent;
  let fixture: ComponentFixture<CardDetallesReporteLanzaComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CardDetallesReporteLanzaComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CardDetallesReporteLanzaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
