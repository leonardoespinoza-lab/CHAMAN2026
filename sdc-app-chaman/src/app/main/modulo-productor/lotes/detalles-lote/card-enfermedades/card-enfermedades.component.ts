import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { IPrediccionEnfermedad, ISiembra, TEnfermedad } from 'modelos/src';
import { SiembraService } from '../../../../../auxiliares/http/siembra.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { DrawerGraficoEnfermedadesComponent } from '../drawer-grafico-enfermedades/drawer-grafico-enfermedades.component';

interface PrescripcionEnfermedad {
  objetivo: string;
  momento: string;
  productos: {
    grupo: string;
    activos: string;
    dosisHa: string;
  }[];
  nota: string;
}

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
        estadoCalculo: this.estadoCalculo(prediccion),
        prescripcion: this.prescripcionPorEnfermedad(enfermedad),
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
      'Mancha Amarilla': 'Puede presentarse desde emergencia hasta hoja bandera.',
      'Roya de la Hoja': 'Puede presentarse desde hoja bandera hasta llenado de granos.',
      'Mancha de la Hoja': 'Puede presentarse en vegetativo y reproductivo temprano.',
      'Fusarium de la Espiga': 'Ventana critica en espigazon y antesis.',
      'Roya del Tallo': 'Mayor riesgo en trigo tardio con cultivo activo.',
      'Roya Anaranjada': 'Mayor riesgo durante crecimiento activo.',
      'Fin de Ciclo': 'Mayor riesgo en floracion y llenado.',
      'Roya del Maiz': 'Puede presentarse desde vegetativo avanzado hasta llenado.',
    };
    return periodos[enfermedad];
  }

  private resumenVariables(prediccion?: IPrediccionEnfermedad): string {
    if (!prediccion?.variables) {
      return 'Sin calculo reciente. Actualizar para cruzar fenologia, humedad, lluvia y temperatura.';
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

  private estadoCalculo(prediccion?: IPrediccionEnfermedad): string {
    if (!prediccion) {
      return 'pendiente de actualizar';
    }
    return 'riesgo calculado';
  }

  private prescripcionPorEnfermedad(enfermedad: TEnfermedad): PrescripcionEnfermedad {
    const base: Record<TEnfermedad, PrescripcionEnfermedad> = {
      'Mancha Amarilla': {
        objetivo: 'Proteger area foliar y evitar avance hacia hoja bandera.',
        momento: 'Aplicar con umbral tecnico confirmado y condiciones predisponentes sostenidas.',
        productos: [
          {
            grupo: 'Triazol + estrobilurina',
            activos: 'Tebuconazole / Propiconazole + Azoxistrobin',
            dosisHa: '0,45 a 0,80 l/ha segun formulado',
          },
        ],
        nota: 'Cargar producto comercial desde la base local y validar marbete antes de recomendar.',
      },
      'Roya de la Hoja': {
        objetivo: 'Cortar ciclos de roya y sostener hoja bandera funcional.',
        momento: 'Priorizar desde hoja bandera cuando el riesgo sube con HR alta y temperatura templada.',
        productos: [
          {
            grupo: 'Triazol o mezcla doble',
            activos: 'Ciproconazole / Tebuconazole + estrobilurina',
            dosisHa: '0,35 a 0,70 l/ha segun formulado',
          },
        ],
        nota: 'La dosis final debe salir del producto seleccionado en la base de agroquimicos.',
      },
      'Mancha de la Hoja': {
        objetivo: 'Reducir manchas foliares tempranas y proteger canopeo.',
        momento: 'Monitorear desde vegetativo con humedad sostenida y lluvias repetidas.',
        productos: [
          {
            grupo: 'Triazol + carboxamida/estrobilurina',
            activos: 'Prothioconazole / Fluxapyroxad / Pyraclostrobin',
            dosisHa: '0,50 a 0,85 l/ha segun formulado',
          },
        ],
        nota: 'Usar rotacion de modos de accion cuando haya aplicaciones sucesivas.',
      },
      'Fusarium de la Espiga': {
        objetivo: 'Reducir infeccion floral y riesgo de micotoxinas.',
        momento: 'Ventana muy corta: espigazon a antesis, con mojado y precipitaciones.',
        productos: [
          {
            grupo: 'Triazol especifico para espiga',
            activos: 'Metconazole / Prothioconazole / Tebuconazole',
            dosisHa: '0,60 a 1,00 l/ha segun formulado',
          },
        ],
        nota: 'Exige ajuste fino por estado fenologico; validar cobertura y condicion de aplicacion.',
      },
      'Roya del Tallo': {
        objetivo: 'Frenar pustulas activas en tallo y hojas.',
        momento: 'Aplicar solo con deteccion o riesgo alto confirmado.',
        productos: [
          {
            grupo: 'Triazol + estrobilurina',
            activos: 'Tebuconazole / Azoxistrobin',
            dosisHa: 'Segun marbete del producto cargado',
          },
        ],
        nota: 'Base inicial pendiente de parametrizar por zona.',
      },
      'Roya Anaranjada': {
        objetivo: 'Proteger cultivo durante crecimiento activo.',
        momento: 'Usar cuando el monitoreo confirme incremento de riesgo.',
        productos: [
          {
            grupo: 'Triazol',
            activos: 'Ciproconazole / Tebuconazole',
            dosisHa: 'Segun marbete del producto cargado',
          },
        ],
        nota: 'Base inicial pendiente de parametrizar por cultivo.',
      },
      'Fin de Ciclo': {
        objetivo: 'Proteger area foliar en floracion y llenado.',
        momento: 'Aplicar con canopeo cerrado, HR alta y lluvias frecuentes.',
        productos: [
          {
            grupo: 'Triazol + estrobilurina/carboxamida',
            activos: 'Azoxistrobin / Ciproconazole / Benzovindiflupyr',
            dosisHa: '0,40 a 0,75 l/ha segun formulado',
          },
        ],
        nota: 'Ajustar por variedad, historial del lote y presion regional.',
      },
      'Roya del Maiz': {
        objetivo: 'Proteger hojas funcionales durante periodo reproductivo.',
        momento: 'Aplicar si el riesgo sube en vegetativo avanzado o prefloracion.',
        productos: [
          {
            grupo: 'Triazol + estrobilurina',
            activos: 'Tebuconazole / Azoxistrobin',
            dosisHa: '0,50 a 0,80 l/ha segun formulado',
          },
        ],
        nota: 'Confirmar compatibilidad del producto con maiz y estadio del cultivo.',
      },
    };

    return base[enfermedad];
  }
}
