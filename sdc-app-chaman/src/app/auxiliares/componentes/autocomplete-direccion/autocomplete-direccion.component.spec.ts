import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AutocompleteDireccionComponent } from './autocomplete-direccion.component';

describe('AutocompleteDireccionComponent', () => {
  let component: AutocompleteDireccionComponent;
  let fixture: ComponentFixture<AutocompleteDireccionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AutocompleteDireccionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AutocompleteDireccionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
