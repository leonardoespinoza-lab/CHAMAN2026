import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { EstadoAlerta, IAlerta, ICanalAlerta, IEstadoAlerta, IListado, SeveridadAlerta } from 'modelos/src';
import { TableLazyLoadEvent } from 'primeng/table';
import { Subscription } from 'rxjs';
import { AlertaService } from '../../../../auxiliares/http/alerta.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { SharedModule } from '../../../../auxiliares/shared.module';

interface IResumenAlarmas {
  nuevas: number;
  activas: number;
  alta: number;
  finalizadas: number;
  total: number;
  riesgoPromedio: number;
  calidadPromedio: number;
  tratadas: number;
}

interface ICategoriaResumen {
  nombre: string;
  icono: string;
  cantidad: number;
  riesgo: number;
  severidad: SeveridadAlerta;
}

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
    private router: Router,
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
      { path: 'productor' },
      { path: 'establecimiento' },
      { path: 'distribuidor' },
      { path: 'quimica' },
    ];
    query.populate = JSON.stringify(populate);

    this.alertas$?.unsubscribe();
    this.alertas$ = this.listado.subscribe<IListado<IAlerta>>('alertas', query).subscribe((data) => {
      this.data = data.datos || [];
      this.totalCount = data.totalCount || 0;
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

  public abrirLote(alerta?: IAlerta): void {
    const idLote = alerta?.siembra?.lote?._id;
    if (!idLote) {
      this.helper.notifWarn('La alarma no tiene un lote asociado para abrir.');
      return;
    }
    this.router.navigateByUrl(`/lotes/detalles/${idLote}`);
  }

  public exportarInforme(): void {
    const resumen = this.resumen();
    const fecha = new Date();
    const reporte = window.open('', '_blank', 'width=1120,height=820');

    if (!reporte) {
      this.helper.notifWarn(
        'El navegador bloqueo la ventana del informe. Habilita ventanas emergentes para exportar PDF.'
      );
      return;
    }

    const filas = this.alertasOrdenadas()
      .map(
        (alerta) => `
          <tr>
            <td>
              <strong>${this.escapeHtml(this.titulo(alerta))}</strong>
              <small>${this.escapeHtml(this.subtitulo(alerta))}</small>
            </td>
            <td>${this.escapeHtml(this.severidadLabel(alerta))}</td>
            <td class="number">${this.formatNumber(this.valorRiesgo(alerta), 0)}/100</td>
            <td>${this.escapeHtml(alerta.estadoActual || 'Nueva')}</td>
            <td>${this.escapeHtml(this.calidad(alerta))}</td>
            <td>${this.escapeHtml(this.fechaTexto(this.fecha(alerta)))}</td>
          </tr>`
      )
      .join('');

    reporte.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Informe de alarmas Chaman</title>
          <style>
            body { margin: 0; padding: 34px; color: #10223a; font-family: Arial, sans-serif; }
            header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #23d3c8; padding-bottom: 18px; }
            h1 { margin: 0; font-size: 32px; }
            p { color: #536886; margin: 6px 0 0; }
            .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 24px 0; }
            .kpi { border: 1px solid #c9d8e8; border-radius: 14px; padding: 14px; }
            .kpi span { color: #60738f; display: block; font-size: 12px; font-weight: 700; text-transform: uppercase; }
            .kpi strong { display: block; margin-top: 6px; font-size: 26px; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; }
            th { background: #eefdfe; color: #10223a; text-align: left; padding: 11px; font-size: 12px; text-transform: uppercase; }
            td { border-bottom: 1px solid #d9e5f0; padding: 12px 11px; vertical-align: top; }
            td small { display: block; color: #60738f; margin-top: 4px; }
            .number { text-align: right; font-weight: 700; }
            footer { margin-top: 22px; color: #60738f; font-size: 12px; }
            @media print { body { padding: 18px; } button { display: none; } }
          </style>
        </head>
        <body>
          <header>
            <div>
              <p>Centro operativo</p>
              <h1>Informe de alarmas</h1>
              <p>Eventos generados por sanidad, malezas, agroclima, sensores y motores de Chaman.</p>
            </div>
            <div>
              <p>Emitido</p>
              <strong>${this.escapeHtml(fecha.toLocaleString('es-AR'))}</strong>
            </div>
          </header>
          <section class="kpis">
            <article class="kpi"><span>Activas</span><strong>${resumen.activas}</strong></article>
            <article class="kpi"><span>Alta prioridad</span><strong>${resumen.alta}</strong></article>
            <article class="kpi"><span>Indice medio</span><strong>${this.formatNumber(resumen.riesgoPromedio, 0)}</strong></article>
            <article class="kpi"><span>Calidad dato</span><strong>${this.formatNumber(resumen.calidadPromedio, 0)}%</strong></article>
          </section>
          <table>
            <thead>
              <tr>
                <th>Alarma</th>
                <th>Severidad</th>
                <th>Indice de riesgo</th>
                <th>Estado</th>
                <th>Dato</th>
                <th>Ultimo evento</th>
              </tr>
            </thead>
            <tbody>${filas || '<tr><td colspan="6">Sin alarmas para informar.</td></tr>'}</tbody>
          </table>
          <footer>Chaman Agro - Centro de alarmas. Validar decisiones a campo antes de ejecutar acciones agronomicas.</footer>
          <script>window.onload = () => setTimeout(() => window.print(), 250);</script>
        </body>
      </html>
    `);
    reporte.document.close();
  }

  public resumen(): IResumenAlarmas {
    const total = this.data.length;
    const riesgoTotal = this.data.reduce((acc, alerta) => acc + this.valorRiesgo(alerta), 0);
    const calidadTotal = this.data.reduce((acc, alerta) => acc + this.calidadScore(alerta), 0);
    return {
      nuevas: this.data.filter((a) => a.estadoActual === 'Nueva').length,
      activas: this.data.filter((a) => a.activa !== false).length,
      alta: this.data.filter((a) => a.activa !== false && ['alta', 'critica'].includes(this.severidad(a))).length,
      finalizadas: this.data.filter((a) => a.estadoActual === 'Finalizada' || a.activa === false).length,
      total,
      riesgoPromedio: total ? riesgoTotal / total : 0,
      calidadPromedio: total ? calidadTotal / total : 0,
      tratadas: this.data.filter((a) => a.estadoActual === 'Tratada').length,
    };
  }

  public categoriasResumen(): ICategoriaResumen[] {
    const grupos = new Map<string, ICategoriaResumen>();
    this.data.forEach((alerta) => {
      const nombre = this.categoriaLabel(alerta);
      const actual =
        grupos.get(nombre) ||
        ({
          nombre,
          icono: this.categoriaIcono(alerta),
          cantidad: 0,
          riesgo: 0,
          severidad: 'baja',
        } as ICategoriaResumen);
      actual.cantidad += 1;
      actual.riesgo = Math.max(actual.riesgo, this.valorRiesgo(alerta));
      actual.severidad = this.severidadPorValor(actual.riesgo);
      grupos.set(nombre, actual);
    });
    return [...grupos.values()].sort((a, b) => b.riesgo - a.riesgo || b.cantidad - a.cantidad);
  }

  public alertasOrdenadas(): IAlerta[] {
    return [...this.data].sort((a, b) => {
      const severidad = this.ordenSeveridad(this.severidad(b)) - this.ordenSeveridad(this.severidad(a));
      if (severidad) return severidad;
      return this.valorRiesgo(b) - this.valorRiesgo(a);
    });
  }

  public alertaPrincipal(): IAlerta | undefined {
    return this.alertasOrdenadas().find((alerta) => alerta.activa !== false);
  }

  public estadoOperativo(): string {
    const resumen = this.resumen();
    if (!resumen.total) return 'Sin eventos activos';
    if (resumen.alta) return 'Requiere atencion';
    if (resumen.activas) return 'Monitoreo activo';
    return 'Eventos cerrados';
  }

  public estadoOperativoClase(): string {
    const resumen = this.resumen();
    if (resumen.alta) return 'alta';
    if (resumen.activas) return 'media';
    return 'baja';
  }

  public titulo(alerta?: IAlerta): string {
    if (!alerta) return 'Alarma operativa';
    return alerta.titulo || this.ultimoReporte(alerta)?.['titulo'] || alerta.descripcion || 'Alarma operativa';
  }

  public subtitulo(alerta?: IAlerta): string {
    if (!alerta) return '';
    const categoria = this.categoriaLabel(alerta);
    const lote = this.lote(alerta);
    return [categoria, lote].filter(Boolean).join(' - ');
  }

  public lote(alerta?: IAlerta): string {
    return alerta?.siembra?.lote?.nombre || alerta?.establecimiento?.nombre || 'Sin lote asociado';
  }

  public productor(alerta?: IAlerta): string {
    return alerta?.productor?.nombre || alerta?.siembra?.lote?.productor?.nombre || 'Productor no informado';
  }

  public fecha(alerta?: IAlerta): string | undefined {
    return alerta?.fechaUltimoEvento || alerta?.fecha || this.ultimoReporte(alerta)?.['fecha'];
  }

  public fechaTexto(fecha?: string): string {
    if (!fecha) return 'Sin fecha';
    const parsed = new Date(fecha);
    if (Number.isNaN(parsed.getTime())) return String(fecha);
    return parsed.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
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

  public categoriaIcono(alerta?: IAlerta): string {
    const categoria = this.slug(
      alerta?.categoria || this.ultimoReporte(alerta)?.['categoria'] || alerta?.tipo || 'operativa'
    );
    const iconos: Record<string, string> = {
      sanitaria: 'pi-shield',
      enfermedad: 'pi-shield',
      malezas: 'pi-sparkles',
      maleza: 'pi-sparkles',
      agroclimatica: 'pi-cloud',
      helada: 'pi-cloud',
      granizo: 'pi-cloud',
      riego: 'pi-tint',
      sensor: 'pi-wifi',
      satelital: 'pi-globe',
      sistema: 'pi-cog',
      operativa: 'pi-bell',
    };
    return iconos[categoria] || 'pi-bell';
  }

  public valorRiesgo(alerta?: IAlerta): number {
    const reporte = this.ultimoReporte(alerta);
    const valor =
      reporte?.['resultado'] ??
      reporte?.['riesgoPct'] ??
      reporte?.['posibilidadPct'] ??
      reporte?.['avancePct'] ??
      reporte?.['emergenciaPct'] ??
      reporte?.['score'] ??
      alerta?.prioridad ??
      0;
    return Math.max(0, Math.min(100, Number(valor) || 0));
  }

  public prioridadOperativa(alerta?: IAlerta): number {
    const valor = alerta?.prioridad ?? this.ultimoReporte(alerta)?.['prioridad'] ?? 0;
    return Math.max(0, Math.min(100, Number(valor) || 0));
  }

  public fechaCritica(alerta?: IAlerta): string | undefined {
    return this.ultimoReporte(alerta)?.['fechaCritica'];
  }

  public fechaCriticaTexto(alerta?: IAlerta): string {
    return this.fechaDiaTexto(this.fechaCritica(alerta));
  }

  public reporteFechaCritica(reporte: Record<string, any>): string | undefined {
    return reporte?.['fechaCritica'];
  }

  public fechaDiaTexto(fecha?: string): string {
    if (!fecha) return 'Sin fecha critica';
    const fechaLocal = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `${fecha}T12:00:00` : fecha;
    const parsed = new Date(fechaLocal);
    if (Number.isNaN(parsed.getTime())) return String(fecha);
    return parsed.toLocaleDateString('es-AR', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
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
    return `${nivel}${calidad.fuente ? ' - ' + calidad.fuente : ''}`;
  }

  public calidadDetalle(alerta?: IAlerta): string {
    const calidad = alerta?.calidadDatos || this.ultimoReporte(alerta)?.['calidadDatos'];
    return (
      calidad?.detalle ||
      'La calidad del input depende de la fuente climatica, sensores disponibles y cobertura del motor.'
    );
  }

  public calidadScore(alerta?: IAlerta): number {
    const calidad = alerta?.calidadDatos || this.ultimoReporte(alerta)?.['calidadDatos'];
    if (typeof calidad?.score === 'number') return Math.max(0, Math.min(100, calidad.score));
    const nivel = this.slug(calidad?.nivel || '');
    if (nivel === 'alta') return 100;
    if (nivel === 'media') return 70;
    if (nivel === 'baja') return 40;
    if (nivel === 'sin-datos') return 0;
    return 55;
  }

  public canales(alerta?: IAlerta): ICanalAlerta[] {
    return alerta?.canales || this.ultimoReporte(alerta)?.['canales'] || [];
  }

  public canalesActivos(alerta?: IAlerta): ICanalAlerta[] {
    return this.canales(alerta).filter((canal) => canal.habilitado !== false);
  }

  public canalResumen(alerta?: IAlerta): string {
    const canales = this.canalesActivos(alerta);
    if (!canales.length) return 'App';
    return canales.map((canal) => canal.canal || 'app').join(', ');
  }

  public origen(alerta?: IAlerta): string {
    const reporte = this.ultimoReporte(alerta);
    return alerta?.origen || reporte?.['origen'] || reporte?.['fuente'] || 'Motor Chaman';
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
      reporte?.['resultado'] ??
      reporte?.['posibilidadPct'] ??
      reporte?.['avancePct'] ??
      reporte?.['emergenciaPct'] ??
      reporte?.['prioridad'] ??
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

  public formatNumber(valor?: number, decimales = 0): string {
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    }).format(Number(valor) || 0);
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

  private ordenSeveridad(severidad: SeveridadAlerta): number {
    const orden: Record<SeveridadAlerta, number> = {
      baja: 1,
      media: 2,
      alta: 3,
      critica: 4,
    };
    return orden[severidad] || 0;
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

  private escapeHtml(value?: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
