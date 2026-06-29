import { Component } from '@angular/core';
import {
  AlgoritmoCatalogo,
  AlgoritmoSimulacion,
  AlgoritmosHttpService,
  HuellaHidricaSimulacion,
} from '../../../auxiliares/http/algoritmos.service';
import { HelperService } from '../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../auxiliares/shared.module';

type MotorAuditableId = 'enfermedades' | 'riego' | 'malezas';
type MotorFieldType = 'text' | 'number' | 'select' | 'boolean';

interface MotorField {
  key: string;
  label: string;
  type: MotorFieldType;
  helper?: string;
  suffix?: string;
  options?: string[];
}

interface MotorDefinition {
  title: string;
  description: string;
  formula: string;
  endpoint: string;
  persistencia: string;
  fields: MotorField[];
}

@Component({
  selector: 'app-algoritmos',
  imports: [SharedModule],
  templateUrl: './algoritmos.component.html',
  styleUrl: './algoritmos.component.scss',
})
export class AlgoritmosComponent {
  public algoritmos: AlgoritmoCatalogo[] = [];
  public seleccionado = 'huella-hidrica';
  public parametrosHuella: any;
  public resultado?: HuellaHidricaSimulacion;
  public resultadoMotor?: AlgoritmoSimulacion;
  public payloadJson = '';
  public motorPayloadJson = '';
  public motorInputEnviado?: Record<string, any>;
  public loading = false;
  public modoJson = false;
  public motorModoJson = false;

  public form = {
    cultivo: 'Trigo',
    rendimientoSecoKgHa: 5200,
    dias: 30,
    et0PromedioMm: 3.8,
    lluviaPromedioMm: 1.4,
    dosisFertilizanteKgHa: 120,
    porcentajeN: 32,
    porcentajeP: 8,
    dosisFitosanitarioLtHa: 0.6,
    concentracion: 25,
    koc: 0.35,
    persistencia: 0.45,
    textura: 'Franco',
    drenaje: 'Bien Drenado',
    pendiente: 'Baja (0 - 3%)',
    labranza: 'Siembra Directa',
    manejo: 'Bueno',
  };

  public enfermedadesForm = {
    cultivo: 'Trigo',
    variedad: 'BAGUETTE 450',
    etapa: 'Hoja bandera',
    humedadRelativa: 88,
    horasMojado: 18,
    lluvia48h: 12,
    temperatura: 18,
    susceptibilidad: 0.7,
  };

  public riegoForm = {
    humedadSueloPct: 31,
    capacidadCampoPct: 34,
    puntoMarchitezPct: 14,
    profundidadRaicesCm: 60,
    et0MmDia: 4.2,
    kc: 0.9,
    lluvia72h: 4,
    probabilidadLluviaPct: 55,
    capacidadRiegoMmDia: 6,
    anchoBulboM: 1,
    metrosLinealesHa: 10000,
    umbralAguaUtilPct: 45,
    raicesActivas: true,
  };

  public malezasForm = {
    cultivo: 'Trigo',
    especie: 'Amaranthus',
    dias: 20,
    temperaturaMedia: 17,
    baseTermica: 8,
    humedadSueloPct: 55,
    lluvia7d: 18,
    k: 0.038,
    x0: 130,
    amplitud: 92,
  };

  private readonly motorDefinitions: Record<MotorAuditableId, MotorDefinition> = {
    enfermedades: {
      title: 'Banco sanitario por cultivo',
      description:
        'Cruza cultivo, variedad, etapa fenologica, humedad persistente, mojado foliar, lluvia, temperatura y susceptibilidad varietal.',
      formula: 'Riesgo sanitario = ventana fenologica x ambiente predisponente x susceptibilidad varietal',
      endpoint: 'POST /algoritmos/enfermedades/simular',
      persistencia: 'Motor productivo: /siembras/:id/prediccion-enfermedades',
      fields: [
        { key: 'cultivo', label: 'Cultivo', type: 'select', options: ['Trigo', 'Soja', 'Maiz'] },
        { key: 'variedad', label: 'Variedad', type: 'text', helper: 'Nombre varietal usado para sensibilidad.' },
        {
          key: 'etapa',
          label: 'Etapa fenologica',
          type: 'select',
          options: ['Emergencia', 'Macollaje', 'Hoja bandera', 'Espigazon', 'Floracion', 'Llenado de granos'],
        },
        { key: 'humedadRelativa', label: 'Humedad relativa', type: 'number', suffix: '%' },
        { key: 'horasMojado', label: 'Horas de mojado', type: 'number', suffix: 'h' },
        { key: 'lluvia48h', label: 'Lluvia 48 h', type: 'number', suffix: 'mm' },
        { key: 'temperatura', label: 'Temperatura media', type: 'number', suffix: 'C' },
        { key: 'susceptibilidad', label: 'Susceptibilidad', type: 'number', helper: '0 tolerante, 1 susceptible.' },
      ],
    },
    riego: {
      title: 'Banco de recomendacion de riego',
      description:
        'Audita agua util real, deficit a capacidad de campo, raices activas, ETc, lluvia efectiva y limite operativo de riego.',
      formula: 'Riego recomendado = deficit util + ETc proyectada - lluvia efectiva, limitado por capacidad operativa',
      endpoint: 'POST /algoritmos/riego/simular',
      persistencia: 'Motor productivo: prediccion diaria sobre siembra, sensor, suelo y clima',
      fields: [
        { key: 'humedadSueloPct', label: 'Humedad suelo', type: 'number', suffix: '%' },
        { key: 'capacidadCampoPct', label: 'Capacidad de campo', type: 'number', suffix: '%' },
        { key: 'puntoMarchitezPct', label: 'Punto de marchitez', type: 'number', suffix: '%' },
        { key: 'profundidadRaicesCm', label: 'Profundidad raices', type: 'number', suffix: 'cm' },
        { key: 'et0MmDia', label: 'ET0 diaria', type: 'number', suffix: 'mm/dia' },
        { key: 'kc', label: 'Kc cultivo', type: 'number' },
        { key: 'lluvia72h', label: 'Lluvia 72 h', type: 'number', suffix: 'mm' },
        { key: 'probabilidadLluviaPct', label: 'Probabilidad lluvia', type: 'number', suffix: '%' },
        { key: 'capacidadRiegoMmDia', label: 'Capacidad de riego', type: 'number', suffix: 'mm/dia' },
        { key: 'anchoBulboM', label: 'Ancho bulbo', type: 'number', suffix: 'm' },
        { key: 'metrosLinealesHa', label: 'Metros lineales', type: 'number', suffix: 'm/ha' },
        { key: 'umbralAguaUtilPct', label: 'Umbral agua util', type: 'number', suffix: '%' },
        { key: 'raicesActivas', label: 'Raices activas', type: 'boolean' },
      ],
    },
    malezas: {
      title: 'Banco de prediccion de malezas',
      description:
        'Evalua emergencia acumulada por cultivo y especie usando acumulacion termica, humedad de suelo, lluvia reciente y curva Gompertz.',
      formula: 'Emergencia = amplitud x exp(-exp(-k x (GDA - x0))) ajustada por humedad y lluvia',
      endpoint: 'POST /algoritmos/malezas/simular',
      persistencia: 'Motor productivo: /siembras/:id/prediccion-malezas',
      fields: [
        { key: 'cultivo', label: 'Cultivo', type: 'select', options: ['Trigo', 'Soja', 'Maiz'] },
        {
          key: 'especie',
          label: 'Especie',
          type: 'select',
          options: ['Amaranthus', 'Rama Negra', 'Chloris', 'Echinochloa', 'Sorghum halepense'],
        },
        { key: 'dias', label: 'Dias simulados', type: 'number' },
        { key: 'temperaturaMedia', label: 'Temperatura media', type: 'number', suffix: 'C' },
        { key: 'baseTermica', label: 'Base termica', type: 'number', suffix: 'C' },
        { key: 'humedadSueloPct', label: 'Humedad suelo', type: 'number', suffix: '%' },
        { key: 'lluvia7d', label: 'Lluvia 7 dias', type: 'number', suffix: 'mm' },
        { key: 'k', label: 'K Gompertz', type: 'number' },
        { key: 'x0', label: 'GDA punto medio', type: 'number' },
        { key: 'amplitud', label: 'Emergencia maxima', type: 'number', suffix: '%' },
      ],
    },
  };

  constructor(
    private service: AlgoritmosHttpService,
    private helper: HelperService
  ) {}

  public get algoritmoActual() {
    return this.algoritmos.find((item) => item.id === this.seleccionado);
  }

  public async ngOnInit(): Promise<void> {
    await this.cargar();
    this.generarPayload();
    this.generarMotorPayload();
  }

  public async cargar(): Promise<void> {
    this.loading = true;
    try {
      const [catalogo, parametros] = await Promise.all([this.service.catalogo(), this.service.parametrosHuella()]);
      this.algoritmos = catalogo;
      this.parametrosHuella = parametros;
    } catch (error) {
      this.helper.notifError(error);
    }
    this.loading = false;
  }

  public seleccionar(id: string): void {
    this.seleccionado = id;
    this.resultado = undefined;
    this.resultadoMotor = undefined;
    this.motorInputEnviado = undefined;
    this.modoJson = false;
    this.motorModoJson = false;
    if (this.esMotorAuditable(id)) {
      this.generarMotorPayload();
    }
  }

  public generarPayload(): void {
    const clima = Array.from({ length: Number(this.form.dias || 0) }).map((_, index) => ({
      fecha: this.fechaDesdeIndex(index),
      lluviaMm: Number(this.form.lluviaPromedioMm || 0),
      et0Mm: Number(this.form.et0PromedioMm || 0),
    }));

    const payload = {
      siembra: {
        fechaSiembra: clima[0]?.fecha || '2026-06-01',
        fechaCosecha: clima[clima.length - 1]?.fecha || '2026-06-30',
        rendimientoObtenidoKgHaSeco: Number(this.form.rendimientoSecoKgHa || 0),
        lluviasPromedio: '> 600 < 1200',
        fijacionN: '> 0 < 30',
        dosisN: 'Alta',
        dosisP: 'Baja',
        labranza: this.form.labranza,
        rendimiento: 'Alto',
        manejoAgronomico: this.form.manejo,
        intensidadLluvias: 'Moderadas',
        materiaOrganica: '> 3 < 5',
        semilla: { cultivo: this.form.cultivo },
        crono: {
          etapas: {
            R0_R1: 13,
            R1_R2: 73,
            R2_R3: 21,
            R3_R4: 16,
            R4_R5: 4,
            R5_R6: 7,
            R6_R7: 24,
          },
        },
      },
      lote: {
        depositoN: '> 0.5',
        texturaLixiviacion: this.form.textura,
        texturaEscorrentia: this.form.textura,
        drenajeNaturalLixiviacion: this.form.drenaje,
        drenajeNaturalEscorrentia: this.form.drenaje,
        erosionEscorrentiaPendiente: this.form.pendiente,
        contenidoP: '> 12 < 20',
      },
      fertilizaciones: [
        {
          dosisKgHa: Number(this.form.dosisFertilizanteKgHa || 0),
          fertilizante: {
            nombre: 'Fertilizante de prueba',
            porcentajeN: Number(this.form.porcentajeN || 0),
            porcentajeP: Number(this.form.porcentajeP || 0),
          },
        },
      ],
      fumigaciones: [
        {
          dosisLtHa: Number(this.form.dosisFitosanitarioLtHa || 0),
          concentracion: Number(this.form.concentracion || 0),
          principioActivo: {
            nombre: 'Principio activo de prueba',
            koc: Number(this.form.koc || 0),
            persistencia: Number(this.form.persistencia || 0),
          },
        },
      ],
      clima,
    };

    this.payloadJson = JSON.stringify(payload, null, 2);
  }

  public async simular(): Promise<void> {
    this.loading = true;
    this.resultado = undefined;
    try {
      const payload = JSON.parse(this.payloadJson);
      this.resultado = await this.service.simularHuella(payload);
    } catch (error) {
      this.helper.notifError(error);
    }
    this.loading = false;
  }

  public async simularActual(): Promise<void> {
    if (this.seleccionado === 'huella-hidrica') {
      await this.simular();
      return;
    }

    this.loading = true;
    this.resultadoMotor = undefined;
    this.motorInputEnviado = undefined;
    try {
      const payload = JSON.parse(this.motorPayloadJson);
      this.motorInputEnviado = payload;
      if (this.seleccionado === 'enfermedades') {
        this.resultadoMotor = await this.service.simularEnfermedades(payload);
      } else if (this.seleccionado === 'riego') {
        this.resultadoMotor = await this.service.simularRiego(payload);
      } else if (this.seleccionado === 'malezas') {
        this.resultadoMotor = await this.service.simularMalezas(payload);
      }
    } catch (error) {
      this.helper.notifError(error);
    }
    this.loading = false;
  }

  public get motorForm(): Record<string, any> {
    if (this.seleccionado === 'enfermedades') return this.enfermedadesForm;
    if (this.seleccionado === 'riego') return this.riegoForm;
    return this.malezasForm;
  }

  public get motorTitle(): string {
    return this.motorDefinition?.title || 'Banco de pruebas';
  }

  public get motorDescription(): string {
    return this.motorDefinition?.description || '';
  }

  public get motorFormula(): string {
    return this.motorDefinition?.formula || '';
  }

  public get motorEndpoint(): string {
    return this.motorDefinition?.endpoint || '';
  }

  public get motorPersistencia(): string {
    return this.motorDefinition?.persistencia || '';
  }

  public get motorDefinition(): MotorDefinition | undefined {
    return this.esMotorAuditable(this.seleccionado) ? this.motorDefinitions[this.seleccionado] : undefined;
  }

  public motorFields(): MotorField[] {
    return this.motorDefinition?.fields || [];
  }

  public setMotorField(key: string, value: any): void {
    const field = this.motorFields().find((item) => item.key === key);
    if (field?.type === 'boolean') {
      this.motorForm[key] = !!value;
    } else {
      const numeric = Number(value);
      this.motorForm[key] = field?.type === 'number' && value !== '' && Number.isFinite(numeric) ? numeric : value;
    }
    this.generarMotorPayload();
  }

  public generarMotorPayload(): void {
    if (!this.esMotorAuditable(this.seleccionado)) {
      return;
    }
    this.motorPayloadJson = JSON.stringify(this.motorForm, null, 2);
  }

  public get inputMotorVisible(): string {
    return this.motorInputEnviado ? JSON.stringify(this.motorInputEnviado, null, 2) : this.motorPayloadJson;
  }

  public get outputMotorVisible(): string {
    return this.resultadoMotor ? JSON.stringify(this.resultadoMotor, null, 2) : '';
  }

  public metricValue(value: unknown): string {
    if (typeof value === 'number') return this.format(value, Number.isInteger(value) ? 0 : 1);
    if (value == null) return '--';
    return `${value}`;
  }

  public fieldId(key: string): string {
    return `motor-${key}`;
  }

  private esMotorAuditable(id: string): id is MotorAuditableId {
    return id === 'enfermedades' || id === 'riego' || id === 'malezas';
  }

  public barHeight(value: number): string {
    return `${Math.max(3, Math.min(100, Number(value) || 0))}%`;
  }

  public format(value?: number, digits = 0): string {
    if (value == null || Number.isNaN(value)) return '--';
    return new Intl.NumberFormat('es-AR', {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    }).format(value);
  }

  private fechaDesdeIndex(index: number): string {
    const date = new Date('2026-06-01T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  }
}
