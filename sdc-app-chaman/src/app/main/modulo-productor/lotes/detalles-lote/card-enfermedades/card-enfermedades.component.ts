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
    if (cultivo === 'Vid') {
      return ['Oidio', 'Botritis', 'Mildiu'];
    }
    if (cultivo === 'Papa') {
      return ['Tizon Tardio', 'Tizon Temprano', 'Rhizoctonia'];
    }
    if (cultivo === 'Manzano') {
      return ['Sarna del Manzano', 'Oidio del Manzano', 'Fuego Bacteriano', 'Carpocapsa'];
    }
    if (cultivo === 'Peral') {
      return ['Sarna del Peral', 'Fuego Bacteriano', 'Psila del Peral'];
    }
    if (cultivo === 'Pecan') {
      return ['Sarna del Pecan', 'Bacteriosis del Pecan'];
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
    const periodos: Partial<Record<TEnfermedad, string>> = {
      'Mancha Amarilla': 'Puede presentarse desde emergencia hasta hoja bandera.',
      'Roya de la Hoja': 'Puede presentarse desde hoja bandera hasta llenado de granos.',
      'Mancha de la Hoja': 'Puede presentarse en vegetativo y reproductivo temprano.',
      'Fusarium de la Espiga': 'Ventana critica en espigazon y antesis.',
      'Roya del Tallo': 'Mayor riesgo en trigo tardio con cultivo activo.',
      'Roya Anaranjada': 'Mayor riesgo durante crecimiento activo.',
      'Fin de Ciclo': 'Mayor riesgo en floracion y llenado.',
      'Roya del Maiz': 'Puede presentarse desde vegetativo avanzado hasta llenado.',
      Oidio: 'Brotes activos, floracion y desarrollo de racimos con humedad favorable.',
      Botritis: 'Floracion, cierre de racimo y madurez con mojado o humedad alta.',
      Mildiu: 'Desde brotacion hasta canopia activa, especialmente despues de lluvias.',
      'Tizon Tardio': 'Desde emergencia hasta llenado de tuberculos con HR alta y mojado foliar.',
      'Tizon Temprano': 'Vegetativo avanzado y llenado, asociado a estres y humedad intermitente.',
      Rhizoctonia: 'Emergencia, tuberizacion y etapas tempranas con suelo frio-humedo.',
      'Sarna del Manzano': 'Brotacion, floracion, cuaje y fruto joven con mojado foliar.',
      'Oidio del Manzano': 'Brotacion y crecimiento de brotes con temperatura templada.',
      'Fuego Bacteriano': 'Floracion y brotes tiernos con temperatura templada/calida y humedad.',
      Carpocapsa: 'Cuaje, desarrollo de fruto y madurez; seguir vuelos/trampas y grados-dia.',
      'Sarna del Peral': 'Brotacion, floracion, cuaje y fruto joven con mojado foliar.',
      'Psila del Peral': 'Brotacion y crecimiento activo; seguir monitoreo de ninfas/adultos.',
      'Sarna del Pecan': 'Brotacion, cuaje y llenado de nuez con humedad alta.',
      'Bacteriosis del Pecan': 'Brotes y frutos jovenes con lluvia/viento y heridas.',
    };
    return periodos[enfermedad] || 'Periodo susceptible configurable por cultivo y zona.';
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
    const base: Partial<Record<TEnfermedad, PrescripcionEnfermedad>> = {
      'Mancha Amarilla': {
        objetivo: 'Proteger area foliar y evitar avance hacia hoja bandera.',
        momento: 'Aplicar con umbral tecnico confirmado y condiciones predisponentes sostenidas.',
        productos: [
          {
            grupo: 'Triazol + estrobilurina',
            activos: 'Tebuconazole / Propiconazole + Azoxistrobin',
            dosisHa: '0,45 a 0,80 l/ha segun formulado',
          },
          {
            grupo: 'Mezcla reforzada',
            activos: 'Prothioconazole o Fluxapyroxad + QoI',
            dosisHa: 'Usar si hay presion alta o historial del lote',
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
          {
            grupo: 'Alternativa de rotacion',
            activos: 'Difenoconazole / Trifloxistrobin',
            dosisHa: 'Elegir por marbete y presion regional',
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
          {
            grupo: 'SDHI + QoI',
            activos: 'Fluxapyroxad / Benzovindifupyr + Azoxistrobina',
            dosisHa: 'Priorizar con manchas activas y humedad sostenida',
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
          {
            grupo: 'Ventana critica',
            activos: 'No usar estrobilurina sola para control de fusarium',
            dosisHa: 'Aplicar con cobertura de espiga y pronostico predisponente',
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
          {
            grupo: 'Mezcla triple',
            activos: 'DMI + QoI + SDHI segun presion sanitaria',
            dosisHa: 'Reservar para alto riesgo o historial sanitario',
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
      Oidio: {
        objetivo: 'Reducir infecciones en brotes, hojas y racimos susceptibles.',
        momento: 'Priorizar aplicaciones preventivas cuando el monitoreo y clima indiquen riesgo.',
        productos: [
          { grupo: 'Multisitio', activos: 'Azufre', dosisHa: 'Segun marbete, temperatura y formulado' },
          { grupo: 'DMI/QoI/SDHI', activos: 'Triazoles, estrobilurinas o carboxamidas registradas', dosisHa: 'Rotar modos de accion y validar etiqueta' },
        ],
        nota: 'Validar registro por cultivo, destino y restricciones de residuo antes de aplicar.',
      },
      Botritis: {
        objetivo: 'Proteger floracion/racimo y reducir infecciones latentes.',
        momento: 'Floracion, cierre de racimo y pre-cosecha si hay humedad sostenida.',
        productos: [
          { grupo: 'Botriticidas especificos', activos: 'Ciprodinil + Fludioxonil / Boscalid / Fenhexamid', dosisHa: 'Segun producto comercial y marbete' },
        ],
        nota: 'La cobertura y rotacion anti-resistencia son criticas.',
      },
      Mildiu: {
        objetivo: 'Prevenir infecciones despues de lluvias y mojado foliar.',
        momento: 'Canopia activa con lluvia o pronostico predisponente.',
        productos: [
          { grupo: 'Preventivos', activos: 'Cobre / Mancozeb', dosisHa: 'Segun marbete' },
          { grupo: 'Sistemicos especificos', activos: 'Metalaxil-M u otros oomyceticidas registrados', dosisHa: 'Usar en rotacion, no repetir sin criterio tecnico' },
        ],
        nota: 'Confirmar registro para vid y estrategia anti-resistencia.',
      },
      'Tizon Tardio': {
        objetivo: 'Proteger follaje y tuberculos contra Phytophthora infestans.',
        momento: 'Emergencia a llenado con HR alta, lluvia o mojado foliar.',
        productos: [
          { grupo: 'Preventivos', activos: 'Mancozeb / Cobre / Clorotalonil donde este registrado', dosisHa: 'Segun marbete' },
          { grupo: 'Especificos oomycetes', activos: 'Metalaxil-M / Cymoxanil / Mandipropamid registrados', dosisHa: 'Segun riesgo y etiqueta' },
        ],
        nota: 'No recomendar sin confirmar destino, carencia y registro vigente.',
      },
      'Tizon Temprano': {
        objetivo: 'Reducir avance de Alternaria en follaje activo.',
        momento: 'Vegetativo avanzado/llenado con estres y humedad favorable.',
        productos: [
          { grupo: 'DMI/QoI/SDHI', activos: 'Difenoconazole / Azoxistrobina / Boscalid registrados', dosisHa: 'Segun marbete' },
        ],
        nota: 'Combinar con manejo de estres y monitoreo de manchas activas.',
      },
      Rhizoctonia: {
        objetivo: 'Reducir dano temprano en brotes, estolones y tuberculos.',
        momento: 'Tratamiento/arranque y emergencia segun historial del lote.',
        productos: [
          { grupo: 'Tratamiento preventivo', activos: 'Flutolanil / Azoxistrobina u opciones registradas', dosisHa: 'Segun formulado y posicion de aplicacion' },
        ],
        nota: 'Depende mucho de semilla, suelo e historial; validar estrategia tecnica.',
      },
      'Sarna del Manzano': {
        objetivo: 'Proteger tejido verde y fruto joven durante infecciones primarias.',
        momento: 'Brotacion a cuaje con mojado foliar.',
        productos: [
          { grupo: 'Preventivos multisitio', activos: 'Captan / Mancozeb / Cobre segun ventana', dosisHa: 'Segun marbete' },
          { grupo: 'Curativos/mezclas', activos: 'Difenoconazole u otros DMI registrados', dosisHa: 'Rotar modos de accion' },
        ],
        nota: 'Ajustar por estadio, carencia y mercado destino.',
      },
      'Sarna del Peral': {
        objetivo: 'Proteger tejido verde y fruto joven durante mojados infectivos.',
        momento: 'Brotacion, floracion y cuaje con humedad alta.',
        productos: [
          { grupo: 'Preventivos multisitio', activos: 'Captan / Mancozeb / Cobre segun registro', dosisHa: 'Segun marbete' },
          { grupo: 'DMI', activos: 'Difenoconazole registrado', dosisHa: 'Segun etiqueta y riesgo' },
        ],
        nota: 'Validar sensibilidad varietal y registro para peral.',
      },
      'Sarna del Pecan': {
        objetivo: 'Proteger brotes, hojas y nuez joven en humedad alta.',
        momento: 'Brotacion a llenado de nuez con mojado prolongado.',
        productos: [
          { grupo: 'Preventivos/mezclas', activos: 'Cobre / DMI / QoI registrados para pecan', dosisHa: 'Segun marbete local' },
        ],
        nota: 'Base inicial: requiere validacion regional y de etiqueta.',
      },
      'Oidio del Manzano': {
        objetivo: 'Reducir infeccion en brotes y hojas nuevas.',
        momento: 'Brotacion y crecimiento activo con clima templado.',
        productos: [
          { grupo: 'Preventivos/DMI', activos: 'Azufre / DMI registrados', dosisHa: 'Segun marbete y temperatura' },
        ],
        nota: 'Evitar fitotoxicidad y rotar modos de accion.',
      },
      'Fuego Bacteriano': {
        objetivo: 'Reducir infeccion floral y avance bacteriano en brotes.',
        momento: 'Floracion con temperatura templada/calida y humedad.',
        productos: [
          { grupo: 'Bactericidas/preventivos', activos: 'Cobre u opciones registradas segun zona', dosisHa: 'Segun marbete' },
        ],
        nota: 'El manejo cultural y alerta temprana son tan importantes como la aplicacion.',
      },
      Carpocapsa: {
        objetivo: 'Proteger fruto segun vuelo y grados-dia.',
        momento: 'Aplicar por umbral/trampas/modelo, no por calendario fijo.',
        productos: [
          { grupo: 'Insecticidas especificos', activos: 'Clorantraniliprol / reguladores / opciones registradas', dosisHa: 'Segun marbete y momento de oviposicion' },
        ],
        nota: 'Es plaga sanitaria; validar monitoreo, carencia y mercado.',
      },
      'Psila del Peral': {
        objetivo: 'Reducir poblaciones de ninfas/adultos y dano por melaza.',
        momento: 'Intervenir por umbral de monitoreo y estado fenologico.',
        productos: [
          { grupo: 'Insecticidas/aceites registrados', activos: 'Aceites, reguladores u opciones registradas', dosisHa: 'Segun marbete' },
        ],
        nota: 'Integrar control biologico y evitar aplicaciones que disparen resurgencia.',
      },
      'Bacteriosis del Pecan': {
        objetivo: 'Reducir infeccion en brotes y frutos jovenes.',
        momento: 'Lluvias, viento/heridas y humedad alta.',
        productos: [
          { grupo: 'Preventivos', activos: 'Cobre u opciones registradas', dosisHa: 'Segun marbete' },
        ],
        nota: 'Base inicial pendiente de validacion regional.',
      },
    };

    return (
      base[enfermedad] || {
        objetivo: 'Monitorear riesgo sanitario y validar recomendacion tecnica.',
        momento: 'Aplicar solo con diagnostico, umbral y condiciones predisponentes confirmadas.',
        productos: [
          {
            grupo: 'Base local',
            activos: 'Seleccionar producto desde la base de agroquimicos validada',
            dosisHa: 'Segun marbete y criterio tecnico',
          },
        ],
        nota: 'Prescripcion orientativa: requiere validacion de etiqueta, cultivo, zona y asesor agronomico.',
      }
    );
  }
}
