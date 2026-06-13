import { Component } from '@angular/core';
import { AlgoritmoCatalogo, AlgoritmosHttpService, HuellaHidricaSimulacion } from '../../../auxiliares/http/algoritmos.service';
import { HelperService } from '../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../auxiliares/shared.module';

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
  public payloadJson = '';
  public loading = false;
  public modoJson = false;

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
