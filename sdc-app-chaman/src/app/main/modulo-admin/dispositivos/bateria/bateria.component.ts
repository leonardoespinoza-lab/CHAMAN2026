import { Component, HostBinding, Input } from '@angular/core';
import { SharedModule } from '../../../../auxiliares/shared.module';

@Component({
  selector: 'app-bateria',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './bateria.component.html',
  styleUrls: ['./bateria.component.scss'],
})
export class BateriaComponent {
  /**
   * El nivel de la batería, un número entre 0 y 100.
   */
  @Input() level: number = 0;

  /**
   * La orientación del ícono de la batería.
   * Puede ser 'horizontal' o 'vertical'.
   */
  @Input() orientation: 'horizontal' | 'vertical' = 'horizontal';

  /**
   * El umbral por debajo del cual la batería se considera baja.
   */
  @Input() lowThreshold: number = 20;

  /**
   * Vincula la clase de orientación al elemento host del componente
   * para una estilización más sencilla.
   */
  @HostBinding('class.vertical') get isVertical() {
    return this.orientation === 'vertical';
  }

  /**
   * Determina la clase CSS a aplicar al nivel de la batería
   * según su carga.
   * @returns Un objeto para usar con ngClass.
   */
  get batteryLevelClass() {
    return {
      'level-low': this.level <= this.lowThreshold,
      'level-medium': this.level > this.lowThreshold && this.level < 60,
      'level-high': this.level >= 60,
    };
  }

  /**
   * Calcula el estilo en línea para la barra de nivel de la batería.
   * @returns Un objeto de estilo para usar con ngStyle.
   */
  get batteryLevelStyle() {
    if (this.orientation === 'horizontal') {
      return { width: `${this.level}%` };
    }
    return { height: `${this.level}%` };
  }
}
