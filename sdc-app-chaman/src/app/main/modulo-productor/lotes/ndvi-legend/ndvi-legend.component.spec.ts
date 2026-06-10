import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NdviLegendComponent } from './ndvi-legend.component';

describe('NdviLegendComponent', () => {
  let component: NdviLegendComponent;
  let fixture: ComponentFixture<NdviLegendComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NdviLegendComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NdviLegendComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
