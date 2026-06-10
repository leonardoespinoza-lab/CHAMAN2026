import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { IPrediccionEnfermedad, ISiembra, TEnfermedad } from 'modelos/src';
import { SiembraService } from '../../../../../auxiliares/http/siembra.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { DrawerGraficoEnfermedadesComponent } from '../drawer-grafico-enfermedades/drawer-grafico-enfermedades.component';

@Component({
  selector: 'app-card-enfermedades',
  imports: [CommonModule, SharedModule, DrawerGraficoEnfermedadesComponent],
  templateUrl: './card-enfermedades.component.html',
  styleUrl: './card-enfermedades.component.scss',
})
export class CardEnfermedadesComponent implements OnInit, OnDestroy {
  @Input() public siembra?: ISiembra;
  public verDrawerGraficoEnfermedades = false;
  public actualizandoPrediccion = false;

  constructor(
    public helper: HelperService,
    private siembraService: SiembraService,
  ) {}

  async ngOnInit(): Promise<void> {}

  ngOnDestroy(): void {}

  public get tienePredicciones(): boolean {
    return !!this.siembra?.ultimaPrediccion?.enfermedades?.length;
  }

  public async actualizarPrediccion(event?: Event): Promise<void> {
    event?.stopPropagation();
    if (!this.siembra?._id || this.actualizandoPrediccion) return;

    this.actualizandoPrediccion = true;
    try {
      const predicciones = await this.siembraService.generarPrediccionEnfermedades(this.siembra._id);
      const ultimaPrediccion = predicciones?.[predicciones.length - 1];
      if (ultimaPrediccion) {
        this.siembra.ultimaPrediccion = ultimaPrediccion;
        this.helper.notifSuccess('Prediccion de enfermedades actualizada');
      } else {
        this.helper.notifSuccess('No se generaron nuevas predicciones');
      }
    } catch (error) {
      this.helper.notifError(error);
    }
    this.actualizandoPrediccion = false;
  }

  public get enfermedadInsights() {
    return this.enfermedadesEsperadas().map((enfermedad) => {
      const prediccion = this.prediccionPorEnfermedad(enfermedad);
      const resultado = prediccion?.resultado ?? 0;
      return {
        enfermedad,
        prediccion,
        resultado,
        fill: this.llenadoRiesgo(resultado, !!prediccion),
        severity: this.severidad(resultado),
        periodo: this.periodoSusceptible(enfermedad),
        sensibilidad: this.sensibilidadVarietal(enfermedad),
        variables: this.resumenVariables(prediccion),
      };
    });
  }

  public get resumenGeneral(): string {
    const cultivo = this.siembra?.semilla?.cultivo || 'cultivo';
    const variedad = this.siembra?.semilla?.variedad || 'la variedad';
    if (!this.tienePredicciones) {
      return `${variedad}: monitoreo activo para ${cultivo}.`;
    }
    const mayor = [...this.enfermedadInsights].sort((a, b) => b.resultado - a.resultado)[0];
    return mayor ? `Mayor atencion: ${mayor.enfermedad}` : `Monitoreo activo para ${cultivo}.`;
  }

  private enfermedadesEsperadas(): TEnfermedad[] {
    const cultivo = this.siembra?.semilla?.cultivo;
    if (cultivo === 'Trigo') {
      return ['Mancha Amarilla', 'Roya de la Hoja', 'Mancha de la Hoja', 'Fusarium de la Espiga'];
    }
    if (cultivo === 'Soja') {
      return ['Fin de Ciclo'];
    }
    if (cultivo === 'Maiz') {
      return ['Roya del Maiz'];
    }
    return [];
  }

  private prediccionPorEnfermedad(enfermedad: TEnfermedad): IPrediccionEnfermedad | undefined {
    return this.siembra?.ultimaPrediccion?.enfermedades?.find((item) => item.enfermedad === enfermedad);
  }

  private llenadoRiesgo(resultado: number, tienePrediccion: boolean): number {
    if (!tienePrediccion) {
      return 10;
    }
    return Math.max(8, Math.min(100, resultado * 4));
  }

  private severidad(resultado: number): 'low' | 'medium' | 'high' {
    if (resultado > 20) {
      return 'high';
    }
    if (resultado > 15) {
      return 'medium';
    }
    return 'low';
  }

  private sensibilidadVarietal(enfermedad: TEnfermedad): string {
    const resistencia = this.siembra?.semilla?.resistencia?.find((item) => item.enfermedad === enfermedad);
    const multiplicador = resistencia?.multiplicador;
    if (multiplicador == null) {
      return 'Sin dato varietal';
    }
    if (multiplicador >= 1.15) {
      return `Susceptible x${multiplicador}`;
    }
    if (multiplicador <= 0.85) {
      return `Tolerante x${multiplicador}`;
    }
    return `Media x${multiplicador}`;
  }

  private periodoSusceptible(enfermedad: TEnfermedad): string {
    const periodos: Record<TEnfermedad, string> = {
      'Mancha Amarilla': 'Emergencia a hoja bandera.',
      'Roya de la Hoja': 'Hoja bandera a llenado.',
      'Mancha de la Hoja': 'Vegetativo a reproductivo temprano.',
      'Fusarium de la Espiga': 'Espigazon y antesis.',
      'Roya del Tallo': 'Trigo tardio.',
      'Roya Anaranjada': 'Crecimiento activo.',
      'Fin de Ciclo': 'Floracion y llenado.',
      'Roya del Maiz': 'Vegetativo avanzado a llenado.',
    };
    return periodos[enfermedad];
  }

  private resumenVariables(prediccion?: IPrediccionEnfermedad): string {
    if (!prediccion?.variables) {
      return 'Sin clima cruzado aun.';
    }
    const labels: Record<string, string> = {
      DHR: 'HR sostenida',
      DPr: 'dias lluvia',
      DPrHRT: 'lluvia + HR + temp',
      PMoj: 'mojado',
      GDN: 'GDN',
      GDAcum: 'GDA',
      GD: 'GD',
      PtAc7: 'lluvia > 7',
      DPr7: 'dias > 7',
      Lt7: 'persistencia',
    };
    return Object.entries(prediccion.variables)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${labels[key] || key}: ${Number(value).toFixed(1)}`)
      .slice(0, 3)
      .join(' - ');
  }
}
