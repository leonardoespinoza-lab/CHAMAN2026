import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CULTIVOS_DISPONIBLES } from 'modelos/src';
import { PhenologyPlantComponent } from './phenology-plant.component';

describe('PhenologyPlantComponent', () => {
  let fixture: ComponentFixture<PhenologyPlantComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PhenologyPlantComponent] }).compileComponents();
    fixture = TestBed.createComponent(PhenologyPlantComponent);
  });

  it('renderiza una ilustracion botanica especifica para los diez cultivos disponibles', () => {
    for (const cultivo of CULTIVOS_DISPONIBLES) {
      fixture.componentRef.setInput('cultivo', cultivo);
      fixture.detectChanges();

      const key = cultivo
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      const shell = fixture.nativeElement.querySelector(`.crop-${key}`);

      expect(shell).withContext(`Ilustracion faltante para ${cultivo}`).not.toBeNull();
      expect(shell.querySelectorAll('svg').length).withContext(`SVG faltante para ${cultivo}`).toBe(1);
    }
  });

  it('aplica fase, escala acotada y resaltado del estadio actual', () => {
    fixture.componentRef.setInput('cultivo', 'Arveja');
    fixture.componentRef.setInput('fase', 'reproductive');
    fixture.componentRef.setInput('crecimiento', 180);
    fixture.componentRef.setInput('actual', true);
    fixture.detectChanges();

    const shell = fixture.nativeElement.querySelector('.botanical-shell');
    expect(shell.classList.contains('phase-reproductive')).toBeTrue();
    expect(shell.classList.contains('is-current')).toBeTrue();
    expect(fixture.componentInstance.escala).toBe(1);
  });
});
