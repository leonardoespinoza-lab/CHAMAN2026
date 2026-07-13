import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CULTIVOS_DISPONIBLES } from 'modelos/src';
import { PhenologyPlantComponent } from './phenology-plant.component';

describe('PhenologyPlantComponent', () => {
  let fixture: ComponentFixture<PhenologyPlantComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PhenologyPlantComponent] }).compileComponents();
    fixture = TestBed.createComponent(PhenologyPlantComponent);
  });

  it('renderiza una referencia fotografica especifica para los diez cultivos disponibles', () => {
    for (const cultivo of CULTIVOS_DISPONIBLES) {
      fixture.componentRef.setInput('cultivo', cultivo);
      fixture.detectChanges();

      const key = cultivo
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      const shell = fixture.nativeElement.querySelector(`.crop-${key}`);

      const image = shell.querySelector('img.specimen-photo');
      expect(shell).withContext(`Referencia faltante para ${cultivo}`).not.toBeNull();
      expect(image).withContext(`Fotografia faltante para ${cultivo}`).not.toBeNull();
      expect(image.getAttribute('src')).toContain(`/photo/${key}/`);
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

  it('selecciona el especimen fotografico segun el estadio agronomico', () => {
    fixture.componentRef.setInput('cultivo', 'Arveja');
    fixture.componentRef.setInput('etapa', 'R1 - Inicio de floracion');
    fixture.componentRef.setInput('fase', 'reproductive');
    fixture.detectChanges();
    expect(fixture.componentInstance.assetPath).toContain('/arveja/reproductive.webp');

    fixture.componentRef.setInput('etapa', 'R3 - Formacion de vainas');
    fixture.detectChanges();
    expect(fixture.componentInstance.assetPath).toContain('/arveja/maturity.webp');

    fixture.componentRef.setInput('cultivo', 'Manzano');
    fixture.componentRef.setInput('etapa', 'Floracion plena');
    fixture.detectChanges();
    expect(fixture.componentInstance.assetPath).toContain('/manzano/vegetative.webp');
  });
});
