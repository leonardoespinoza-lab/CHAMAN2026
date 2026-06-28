import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { HuellaHidricaSeguimiento } from '../../../../../auxiliares/http/siembra.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetalleSiembra } from '../detalles-lote.component';

@Component({
  selector: 'app-drawer-huella-hidrica',
  imports: [CommonModule, SharedModule],
  templateUrl: './drawer-huella-hidrica.component.html',
  styleUrl: './drawer-huella-hidrica.component.scss',
})
export class DrawerHuellaHidricaComponent implements OnInit, OnDestroy {
  public loading = false;
  @Input() public visible: boolean = true;
  @Output() public visibleChange = new EventEmitter<boolean>();
  @Input() public siembra?: IDetalleSiembra;
  @Input() public seguimiento?: HuellaHidricaSeguimiento;
  public unidad: 'lt/kg' | 'lt/kCal' = 'lt/kg';
  public unidades = ['lt/kg', 'lt/kCal'];

  constructor(public helper: HelperService) {}

  async ngOnInit(): Promise<void> {}

  ngOnDestroy(): void {}

  public get huella() {
    return this.siembra?.huellaHidrica;
  }

  public get esFinal(): boolean {
    return !!this.huella;
  }

  public get calidad() {
    return this.huella?.calidad || this.seguimiento?.calidad;
  }

  public get metodologia() {
    return this.huella?.metodologia || this.seguimiento?.metodologia;
  }

  public get componentes() {
    return this.huella?.componentes || this.seguimiento?.parciales;
  }

  public get periodo(): string {
    const periodo = this.seguimiento?.periodo;
    if (!periodo?.desde || !periodo?.hasta) return '';
    return `${periodo.desde} a ${periodo.hasta}`;
  }

  public get filasHuella() {
    if (this.huella) {
      return [
        {
          clase: 'green',
          nombre: 'Huella verde',
          valor: this.unidad === 'lt/kg' ? this.huella.verde?.litrosKg : this.huella.verde?.litrosKcal,
          unidad: this.unidad,
          detalle: 'Lluvia efectiva consumida por el cultivo.',
        },
        {
          clase: 'blue',
          nombre: 'Huella azul',
          valor: this.unidad === 'lt/kg' ? this.huella.azul?.litrosKg : this.huella.azul?.litrosKcal,
          unidad: this.unidad,
          detalle: 'Riego o agua externa registrada.',
        },
        {
          clase: 'gray',
          nombre: 'Huella gris',
          valor: this.unidad === 'lt/kg' ? this.huella.gris?.litrosKg : this.huella.gris?.litrosKcal,
          unidad: this.unidad,
          detalle: 'Carga potencial de fertilizantes y fitosanitarios.',
        },
        {
          clase: 'total',
          nombre: 'Total',
          valor: this.unidad === 'lt/kg' ? this.huella.total?.litrosKg : this.huella.total?.litrosKcal,
          unidad: this.unidad,
          detalle: 'Resultado consolidado al cosechar.',
        },
      ];
    }

    const progreso = this.seguimiento?.progreso;
    if (!progreso) return [];
    return [
      {
        clase: 'green',
        nombre: 'Verde acumulada',
        valor: progreso.verde.litrosKg ?? progreso.verde.litrosHa,
        unidad: progreso.verde.litrosKg != null ? 'lt/kg' : 'lt/ha',
        detalle: progreso.verde.detalle,
      },
      {
        clase: 'blue',
        nombre: 'Azul real',
        valor: progreso.azul.litrosKg ?? progreso.azul.litrosHa,
        unidad: progreso.azul.litrosKg != null ? 'lt/kg' : 'lt/ha',
        detalle: progreso.azul.detalle,
      },
      {
        clase: 'gray',
        nombre: 'Gris acumulada',
        valor: progreso.gris.litrosKg ?? progreso.gris.litrosHa,
        unidad: progreso.gris.litrosKg != null ? 'lt/kg' : 'lt/ha',
        detalle: progreso.gris.detalle,
      },
      {
        clase: 'total',
        nombre: 'Total en seguimiento',
        valor: progreso.total.litrosKg ?? progreso.total.litrosHa,
        unidad: progreso.total.litrosKg != null ? 'lt/kg' : 'lt/ha',
        detalle: progreso.total.detalle,
      },
    ];
  }

  public get filasComponentes() {
    const c = this.componentes || {};
    return [
      { label: 'ETc acumulada', value: c.etcTotalMm, unit: 'mm' },
      { label: 'Lluvia total', value: c.lluviaTotalMm, unit: 'mm' },
      { label: 'Lluvia efectiva', value: c.lluviaEfectivaMm, unit: 'mm' },
      { label: 'Verde consumida', value: c.verdeMm, unit: 'mm' },
      { label: 'Azul real', value: c.azulRealMm, unit: 'mm' },
      { label: 'Deficit potencial', value: c.deficitPotencialMm, unit: 'mm' },
      { label: 'Riego registrado', value: c.riegoRegistradoMm, unit: 'mm' },
      { label: 'Gris total', value: c.grisLitrosHa, unit: 'lt/ha' },
    ].filter((item) => item.value != null);
  }

  public numero(value?: number): number {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }
}
