import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListadoAlertasComponent } from './listado-alertas.component';

describe('ListadoAlertasComponent', () => {
  let component: ListadoAlertasComponent;
  let fixture: ComponentFixture<ListadoAlertasComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListadoAlertasComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ListadoAlertasComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
