import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListadoLotesComponent } from './listado-lotes/listado-lotes.component';

describe('LotesComponent', () => {
  let component: ListadoLotesComponent;
  let fixture: ComponentFixture<ListadoLotesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListadoLotesComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ListadoLotesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
