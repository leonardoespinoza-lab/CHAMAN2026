import { Component, Input } from '@angular/core';
import { PhenologyVisualPhase } from './phenology-visual';

@Component({
  selector: 'app-phenology-plant',
  templateUrl: './phenology-plant.component.html',
  styleUrl: './phenology-plant.component.scss',
})
export class PhenologyPlantComponent {
  @Input() public cultivo?: string;
  @Input() public fase: PhenologyVisualPhase = 'vegetative';
  @Input() public crecimiento = 100;
  @Input() public actual = false;

  public get cultivoKey(): string {
    return String(this.cultivo || 'trigo')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  public get escala(): number {
    return Math.max(0.36, Math.min(1, Number(this.crecimiento || 100) / 100));
  }
}
