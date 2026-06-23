import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { IClimaEstacionMeteorologica, IEstacion, IValores } from 'modelos/src';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetallesLote } from '../detalles-lote.component';

interface VariableCentral {
  label: string;
  value: string;
  detail: string;
  icon: string;
  disponible: boolean;
}

@Component({
  selector: 'app-card-central-meteorologica',
  imports: [CommonModule, SharedModule],
  templateUrl: './card-central-meteorologica.component.html',
  styleUrl: './card-central-meteorologica.component.scss',
})
export class CardCentralMeteorologicaComponent implements OnChanges {
  @Input() public lote?: IDetallesLote;

  public variables: VariableCentral[] = [];
  public chips: string[] = [];
  public actualizado = '';

  private readonly numeroAr = new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 1,
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lote']) {
      this.prepararVista();
    }
  }

  public get visible(): boolean {
    return !!this.central || this.establecimiento?.fuenteClimaPreferida === 'FieldClimate' || this.clima?.fuente === 'FieldClimate';
  }

  public get nombreCentral(): string {
    return (
      this.central?.name?.custom ||
      this.central?.name?.original ||
      this.clima?.estacion ||
      'Central FieldClimate'
    );
  }

  public get subtituloCentral(): string {
    return this.central?.info?.device_name || this.central?.info?.description || 'Estacion meteorologica asignada al establecimiento';
  }

  public get estadoTexto(): string {
    if (this.clima?.fuente === 'FieldClimate') return 'Lectura FieldClimate';
    if (this.central) return 'Central asignada';
    return 'Sin central asignada';
  }

  public get usaFieldClimate(): boolean {
    return this.clima?.fuente === 'FieldClimate';
  }

  private prepararVista(): void {
    this.variables = this.crearVariables();
    this.chips = this.crearChips();
    this.actualizado = this.formatearFecha(this.establecimiento?.climaActual?.fecha || this.clima?.fecha || this.central?.estado?.ultimoSync);
  }

  private crearVariables(): VariableCentral[] {
    return [
      this.variable('Temperatura', this.clima?.temperatura, 'C', 'pi pi-sun', 'Aire actual'),
      this.variable('Humedad', this.clima?.humedad, '%', 'pi pi-percentage', 'HR ambiente'),
      this.variable('Lluvia', this.clima?.lluvia, 'mm', 'pi pi-cloud', 'Ultima lectura'),
      this.variable('Viento', this.clima?.velocidadViento, 'km/h', 'pi pi-send', 'Velocidad'),
      this.variable('Rafaga', this.clima?.rafagaViento, 'km/h', 'pi pi-bolt', 'Maxima reciente'),
      this.variable('Direccion', this.clima?.direccionViento, 'deg', 'pi pi-compass', 'Sentido predominante'),
      this.variable('Radiacion', this.clima?.radiacionSolar, 'W/m2', 'pi pi-sparkles', 'Solar'),
      this.variable('Presion', this.clima?.presion, 'hPa', 'pi pi-gauge', 'Atmosferica'),
      this.variable('ET0', this.clima?.et0, 'mm', 'pi pi-chart-line', 'Referencia'),
    ];
  }

  private variable(label: string, valores: IValores | undefined, unidad: string, icon: string, detail: string): VariableCentral {
    const value = this.leerValor(valores);
    return {
      label,
      value: value === undefined ? '--' : `${this.numeroAr.format(value)} ${unidad}`,
      detail,
      icon,
      disponible: value !== undefined,
    };
  }

  private leerValor(valores?: IValores): number | undefined {
    const candidatos = [valores?.last, valores?.avg, valores?.max, valores?.sum, valores?.result];
    return candidatos.find((value): value is number => typeof value === 'number' && Number.isFinite(value));
  }

  private crearChips(): string[] {
    const variablesCentral = this.central?.variablesDisponibles?.filter(Boolean) || [];
    if (variablesCentral.length) {
      return variablesCentral.slice(0, 14);
    }
    return this.variables
      .filter((variable) => variable.disponible)
      .map((variable) => variable.label);
  }

  private formatearFecha(fecha?: string): string {
    if (!fecha) return 'Sin sincronizacion reciente';
    const date = new Date(fecha);
    if (Number.isNaN(date.getTime())) return fecha;
    return date.toLocaleString('es-AR', {
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  }

  private get establecimiento() {
    return this.lote?.establecimiento;
  }

  private get central(): IEstacion | undefined {
    return this.establecimiento?.estacionMeteorologica;
  }

  private get clima(): IClimaEstacionMeteorologica | undefined {
    return this.establecimiento?.climaActual?.clima;
  }
}
