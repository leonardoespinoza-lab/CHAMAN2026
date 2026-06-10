import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BateriaComponent } from './bateria.component';

describe('BateriaComponent', () => {
  let component: BateriaComponent;
  let fixture: ComponentFixture<BateriaComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BateriaComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BateriaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
