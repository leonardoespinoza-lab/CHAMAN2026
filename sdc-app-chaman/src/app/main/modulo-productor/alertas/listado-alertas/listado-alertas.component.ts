import { Component, OnDestroy, OnInit } from '@angular/core';
import { EstadoAlerta, IAlerta, ICanalAlerta, IEstadoAlerta, IListado, SeveridadAlerta } from 'modelos/src';
import { TableLazyLoadEvent } from 'primeng/table';
import { Subscription } from 'rxjs';
import { AlertaService } from '../../../../auxiliares/http/alerta.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { SharedModule } from '../../../../auxiliares/shared.module';

@Component({
  selector: 'app-listado-alertas',
  imports: [SharedModule],
  templateUrl: './listado-alertas.component.html',
  styleUrl: './listado-alertas.component.scss',
})
export class ListadoAlertasComponent implements OnInit, OnDestroy {
  public name = ListadoAlertasComponent.name;
  public data: IAlerta[] = [];
  public totalCount: number = 0;
  public loading: boolean = false;

  public estados: EstadoAlerta[] = ['Nueva', 'Tratada', 'Postergada', 'Finalizada'];
  public estadosSeleccionados: EstadoAlerta[] = [];
  public alertaSeleccionada?: IAlerta;
  public detalleVisible: boolean = false;
  public guardandoEstado: boolean = false;

  private alertas$?: Subscription;

  constructor(
    private alertasService: AlertaService,
    private listado: ListadosService,
    public helper: HelperService
  ) {}

  public async loadData(event: TableLazyLoadEvent): Promise<void> {
    this.loading = true;
    const query = this.helper.buildMongoQuery(event, ['estadoActual']);
    const populate = [
      {
        path: 'siembra',
        populate: {
          path: 'lote',
        },
      },
    ];
    query.populate = JSON.stringify(populate);

    this.alertas$?.unsubscribe();
    this.alertas$ = this.listado.subscribe<IListado<IAlerta>>('alertas', query).subscribe((data) => {
      this.data = data.datos;
      this.totalCount = data.totalCount;
      console.log(`listado de alertas`, data);
    });
    await this.listado.getLastValue('alertas', query);
    this.loading = false;
  }

  public abrirDetalle(alerta: IAlerta): void {
    this.alertaSeleccionada = alerta;
    this.detalleVisible = true;
  }

  public async cambiarEstado(estado: EstadoAlerta): Promise<void> {
    if (!this.alertaSeleccionada?._id || this.guardandoEstado) return;

    this.guardandoEstado = true;
    try {
      const cambio: IEstadoAlerta = {
        estado,
        comentario: this.comentarioEstado(estado),
      };

      const actualizada = await this.alertasService.cambiarEstado(this.alertaSeleccionada._id, {
        estado: cambio,
        activa: estado === 'Nueva' || estado === 'Postergada',
      });

      this.alertaSeleccionada = actualizada;
      this.data = this.data.map((item) => (item._id === actualizada._id ? actualizada : item));
      this.listado.patchEntityItem('alertas', actualizada);
    } finally {
      this.guardandoEstado = false;
    }
  }

  public resumen(): { nuevas: number; activas: number; alta: number; finalizadas: number } {
    return {
      nuevas: this.data.filter((a) => a.estadoActual === 'Nueva').length,
      activas: this.data.filter((a) => a.activa !== false).length,
      alta: this.data.filter((a) => ['alta', 'critica'].includes(this.severidad(a))).length,
      finalizadas: this.data.filter((a) => a.estadoActual === 'Finalizada' || a.activa === false).length,
    };
  }

  public titulo(alerta?: IAlerta): string {
    if (!alerta) return 'Alarma operativa';
    return alerta.titulo || this.ultimoReporte(alerta)?.['titulo'] || alerta.descripcion || 'Alarma operativa';
  }

  public subtitulo(alerta?: IAlerta): string {
    if (!alerta) return '';
    const categoria = this.categoriaLabel(alerta);
    const lote = this.lote(alerta);
    return [categoria, lote].filter(Boolean).join(' · ');
  }

  public lote(alerta?: IAlerta): string {
    return alerta?.siembra?.lote?.nombre || alerta?.establecimiento?.nombre || 'Sin lote asociado';
  }

  public fecha(alerta?: IAlerta): string | undefined {
    return alerta?.fechaUltimoEvento || alerta?.fecha || this.ultimoReporte(alerta)?.['fecha'];
  }

  public severidad(alerta?: IAlerta): SeveridadAlerta {
    const reporte = this.ultimoReporte(alerta);
    return (alerta?.severidad ||
      reporte?.['severidad'] ||
      this.severidadPorValor(this.valorRiesgo(alerta))) as SeveridadAlerta;
  }

  public severidadLabel(alerta?: IAlerta): string {
    const labels: Record<SeveridadAlerta, string> = {
      baja: 'Baja',
      media: 'Media',
      alta: 'Alta',
      critica: 'Critica',
    };
    return labels[this.severidad(alerta)];
  }

  public categoriaLabel(alerta?: IAlerta): string {
    const categoria = alerta?.categoria || this.ultimoReporte(alerta)?.['categoria'] || alerta?.tipo || 'operativa';
    const labels: Record<string, string> = {
      sanitaria: 'Sanidad',
      malezas: 'Malezas',
      agroclimatica: 'Agroclima',
      riego: 'Riego',
      sensor: 'Sensores',
      satelital: 'Satelite',
      operativa: 'Operativa',
      sistema: 'Sistema',
      enfermedad: 'Sanidad',
      maleza: 'Malezas',
      helada: 'Agroclima',
      granizo: 'Agroclima',
    };
    return labels[categoria] || categoria;
  }

  public valorRiesgo(alerta?: IAlerta): number {
    const reporte = this.ultimoReporte(alerta);
    const valor =
      alerta?.prioridad ??
      reporte?.['resultado'] ??
      reporte?.['riesgoPct'] ??
      reporte?.['posibilidadPct'] ??
      reporte?.['avancePct'] ??
      reporte?.['emergenciaPct'] ??
      reporte?.['score'] ??
      0;
    return Math.max(0, Math.min(100, Number(valor) || 0));
  }

  public lectura(alerta?: IAlerta): string {
    const reporte = this.ultimoReporte(alerta);
    return (
      alerta?.lectura ||
      reporte?.['lectura'] ||
      reporte?.['mensaje'] ||
      reporte?.['resumen'] ||
      'Evento generado por los motores de Chaman con los datos disponibles.'
    );
  }

  public recomendacion(alerta?: IAlerta): string {
    const reporte = this.ultimoReporte(alerta);
    return (
      alerta?.recomendacion ||
      alerta?.accionSugerida ||
      reporte?.['recomendacion'] ||
      reporte?.['accionSugerida'] ||
      'Revisar el lote, validar el contexto agronomico y registrar la accion realizada.'
    );
  }

  public calidad(alerta?: IAlerta): string {
    const calidad = alerta?.calidadDatos || this.ultimoReporte(alerta)?.['calidadDatos'];
    if (!calidad) return 'Calidad no informada';
    const nivel = calidad.nivel ? `${calidad.nivel}` : 'media';
    return `${nivel}${calidad.fuente ? ' · ' + calidad.fuente : ''}`;
  }

  public canales(alerta?: IAlerta): ICanalAlerta[] {
    return alerta?.canales || this.ultimoReporte(alerta)?.['canales'] || [];
  }

  public reportes(alerta?: IAlerta): Record<string, any>[] {
    return [...(alerta?.reportes || [])].reverse();
  }

  public reporteFecha(reporte: Record<string, any>): string | undefined {
    return reporte?.['fecha'];
  }

  public reporteTitulo(reporte: Record<string, any>, alerta?: IAlerta): string {
    return (
      reporte?.['titulo'] || reporte?.['enfermedad'] || reporte?.['maleza'] || reporte?.['tipo'] || this.titulo(alerta)
    );
  }

  public reporteRiesgo(reporte: Record<string, any>, alerta?: IAlerta): number {
    const valor =
      reporte?.['resultado'] ||
      reporte?.['posibilidadPct'] ||
      reporte?.['avancePct'] ||
      reporte?.['emergenciaPct'] ||
      reporte?.['prioridad'] ||
      this.valorRiesgo(alerta);
    return Math.max(0, Math.min(100, Number(valor) || 0));
  }

  public estadoClase(alerta?: IAlerta): string {
    return this.slug(alerta?.estadoActual || 'Nueva');
  }

  public slug(value?: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.alertas$?.unsubscribe();
  }

  private ultimoReporte(alerta?: IAlerta): Record<string, any> | undefined {
    const reportes = alerta?.reportes || [];
    return reportes[reportes.length - 1];
  }

  private severidadPorValor(valor: number): SeveridadAlerta {
    if (valor >= 75) return 'critica';
    if (valor >= 45) return 'alta';
    if (valor >= 15) return 'media';
    return 'baja';
  }

  private comentarioEstado(estado: EstadoAlerta): string {
    const comentarios: Record<EstadoAlerta, string> = {
      Nueva: 'Alarma reabierta desde el centro de alarmas.',
      Tratada: 'Alarma marcada como tratada desde el centro de alarmas.',
      Postergada: 'Alarma postergada para seguimiento posterior.',
      Finalizada: 'Alarma finalizada desde el centro de alarmas.',
    };
    return comentarios[estado];
  }
}
