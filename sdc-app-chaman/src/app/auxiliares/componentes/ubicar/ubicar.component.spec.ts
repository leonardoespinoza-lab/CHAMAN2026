import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UbicarComponent } from './ubicar.component';

describe('UbicarComponent', () => {
  let component: UbicarComponent;
  let fixture: ComponentFixture<UbicarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UbicarComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UbicarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
