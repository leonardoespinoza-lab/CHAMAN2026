import { Component, Input } from '@angular/core';
import { PhenologyVisualPhase } from './phenology-visual';

@Component({
  selector: 'app-phenology-plant',
  templateUrl: './phenology-plant.component.html',
  styleUrl: './phenology-plant.component.scss',
})
export class PhenologyPlantComponent {
  @Input() public cultivo?: string;
  @Input() public etapa?: string;
  @Input() public fase: PhenologyVisualPhase = 'vegetative';
  @Input() public crecimiento = 100;
  @Input() public actual = false;
  @Input() public indice = 0;
  @Input() public total = 5;

  private readonly supportedCrops = new Set([
    'arveja',
    'cebada',
    'maiz',
    'manzano',
    'papa',
    'pecan',
    'peral',
    'soja',
    'trigo',
    'vid',
  ]);

  private readonly assetStages = ['implantation', 'emergence', 'vegetative', 'reproductive', 'maturity'];

  public get cultivoKey(): string {
    return String(this.cultivo || 'trigo')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  public get cultivoAssetKey(): string {
    return this.supportedCrops.has(this.cultivoKey) ? this.cultivoKey : 'trigo';
  }

  public get assetPath(): string {
    return `images/phenology/photo/${this.cultivoAssetKey}/${this.assetStages[this.assetIndex]}.webp`;
  }

  public get assetAlt(): string {
    const cultivo = String(this.cultivo || 'Cultivo').trim();
    const etapa = String(this.etapa || this.fase).trim();
    return `Referencia fotografica de ${cultivo} en ${etapa}`;
  }

  public get assetIndex(): number {
    const stage = this.normalize(this.etapa);

    if (this.fase === 'rest' || this.includesAny(stage, ['dormancia', 'reposo'])) return 0;
    if (this.includesAny(stage, ['siembra', 'plantacion', 'germinacion', 'semilla'])) return 0;
    if (this.includesAny(stage, ['emergencia', 'brotacion', 'brote', 'yema', 'green tip'])) return 1;

    if (this.isTreeCrop) {
      if (this.includesAny(stage, ['cuaje', 'fruto', 'nuez', 'llenado'])) return 3;
      if (this.includesAny(stage, ['floracion', 'flor', 'antesis'])) return 2;
    }

    if (
      this.includesAny(stage, [
        'vaina',
        'llenado',
        'tuberizacion',
        'envero',
        'madurez',
        'senescencia',
        'cosecha',
        'r3',
        'r5',
        'r7',
      ])
    ) {
      return 4;
    }

    if (this.includesAny(stage, ['floracion', 'antesis', 'espigazon', 'polinizacion', 'r1'])) return 3;

    if (this.fase === 'implantation') return this.indice > 0 ? 1 : 0;
    if (this.fase === 'reproductive') return 3;
    if (this.fase === 'maturity' || this.fase === 'harvest') return 4;

    const normalizedIndex = this.total <= 1 ? 0.5 : Math.max(0, Math.min(1, this.indice / (this.total - 1)));
    return Math.max(0, Math.min(4, Math.round(normalizedIndex * 4)));
  }

  public get escala(): number {
    return Math.max(0.36, Math.min(1, Number(this.crecimiento || 100) / 100));
  }

  private get isTreeCrop(): boolean {
    return ['manzano', 'peral', 'pecan'].includes(this.cultivoAssetKey);
  }

  private normalize(value?: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private includesAny(value: string, candidates: string[]): boolean {
    return candidates.some((candidate) => value.includes(candidate));
  }
}
