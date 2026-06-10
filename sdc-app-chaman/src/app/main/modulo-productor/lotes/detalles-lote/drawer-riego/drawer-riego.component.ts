import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import * as Highcharts from 'highcharts';
import { IDispositivo } from 'modelos/src';
import { ReporteService } from '../../../../../auxiliares/http/reporte.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetalleSiembra, IDetallesLote } from '../detalles-lote.component';

// Importar e inicializar el módulo de heatmap
import HeatmapModule from 'highcharts/modules/heatmap';
HeatmapModule(Highcharts);

export interface MedicionProfundidad {
  profundidad: number;
  humedad: {
    actual: number;
    unidad: string;
  };
  temperatura: {
    actual: number;
    unidad: string;
  };
}

@Component({
  selector: 'app-drawer-riego',
  imports: [CommonModule, SharedModule],
  templateUrl: './drawer-riego.component.html',
  styleUrl: './drawer-riego.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DrawerRiegoComponent implements OnInit, OnDestroy, AfterViewInit, OnChanges {
  @ViewChild('chartContainer', { static: false }) chartContainer?: ElementRef;
  @ViewChild('heatmapContainer', { static: false }) heatmapContainer?: ElementRef;
  @ViewChild('evapotranspiracionContainer', { static: false }) evapotranspiracionContainer?: ElementRef;

  // Referencias adicionales para modo móvil
  @ViewChild('chartContainerMobile', { static: false }) chartContainerMobile?: ElementRef;
  @ViewChild('heatmapContainerMobile', { static: false }) heatmapContainerMobile?: ElementRef;
  @ViewChild('evapotranspiracionContainerMobile', { static: false }) evapotranspiracionContainerMobile?: ElementRef;

  public loading = false;
  public loadingGrafico = false;
  @Input() public visible: boolean = false;
  @Output() public visibleChange = new EventEmitter<boolean>();
  @Input() public siembra?: IDetalleSiembra;
  @Input() public lote?: IDetallesLote;

  public dispositivosHumedad: IDispositivo[] = [];
  public chartOptionsGraficoHumedad?: Highcharts.Options;
  public chartOptionsHistograma?: Highcharts.Options;
  public chartOptionsEvapotranspiracion?: Highcharts.Options;
  public labelsUltimos7Dias: string[] = [];
  public datosGraficoHumedad: any = null;
  public datosHistogramaHumedad: any = null;
  public datosEvapotranspiracion: any = null;
  public opcionesHistograma: any = {};
  public valoresHumedadSemana: number[] = [];
  public valoresHistograma: any[] = [];
  public valoresEvapotranspiracion: number[] = [];
  public profundidadesUnicas: number[] = []; // Array para almacenar las profundidades reales

  private chartInstance?: Highcharts.Chart;
  private heatmapInstance?: Highcharts.Chart;
  private evapotranspiracionInstance?: Highcharts.Chart;
  private resizeObserver?: ResizeObserver;
  private isResizing = false;

  constructor(
    public helper: HelperService,
    private reporteService: ReporteService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {
    // Pre-calcular los labels de los últimos 7 días una sola vez
    this.generarLabelsUltimos7Dias();
  }

  // Listener para redimensionar gráficos cuando cambia el tamaño de la ventana
  @HostListener('window:resize', ['$event'])
  onWindowResize(event: any): void {
    if (this.isResizing) return; // Evitar llamadas múltiples

    this.isResizing = true;

    // Usar setTimeout más largo para dar tiempo a que se complete el cambio de layout
    setTimeout(() => {
      this.redimensionarGraficos();
      this.isResizing = false;
    }, 500);
  }
  async ngOnInit(): Promise<void> {
    await this.cargarDispositivosHumedad();
    this.configurarGraficoHumedad();
    this.configurarHistogramaHumedad();
    this.configurarGraficoEvapotranspiracion();

    // Procesar datos de evapotranspiración después de la configuración inicial
    this.procesarDatosEvapotranspiracion();
  }

  ngOnDestroy(): void {
    // Limpiar instancias de gráficos al destruir el componente
    if (this.chartInstance) {
      this.chartInstance.destroy();
    }
    if (this.heatmapInstance) {
      this.heatmapInstance.destroy();
    }
    if (this.evapotranspiracionInstance) {
      this.evapotranspiracionInstance.destroy();
    }

    // Limpiar ResizeObserver
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Detectar cambios en la visibilidad del drawer
    if (changes['visible']) {
      if (changes['visible'].currentValue && !changes['visible'].previousValue) {
        // Esperar a que el drawer termine de aparecer
        setTimeout(() => {
          this.renderizarGraficos();
        }, 300);
      }
    }

    // Detectar cambios en el lote que puedan incluir nuevos datos climáticos
    if (changes['lote'] && changes['lote'].currentValue !== changes['lote'].previousValue) {
      // Procesar datos de evapotranspiración con los nuevos datos
      setTimeout(() => {
        this.procesarDatosEvapotranspiracion();
        this.renderizarGraficos();
      }, 100);
    }
  }

  public ngAfterViewInit(): void {
    // Configurar ResizeObserver para detectar cambios en los contenedores
    this.setupResizeObserver();

    // Esperar más tiempo en iOS para asegurar que los datos estén listos y el DOM esté completamente renderizado
    setTimeout(() => {
      this.procesarDatosEvapotranspiracion();
      this.renderizarGraficos();
    }, 800); // Incrementar de 500ms a 800ms para iOS

    // Segundo intento después de más tiempo para iOS
    setTimeout(() => {
      this.procesarDatosEvapotranspiracion();
      this.renderizarGraficos();
    }, 2000); // Incrementar de 1500ms a 2000ms para iOS

    // Tercer intento específico para iOS si los gráficos aún no están visibles
    setTimeout(() => {
      const hasCharts = !!(this.chartInstance || this.heatmapInstance || this.evapotranspiracionInstance);
      if (!hasCharts && this.visible) {
        this.procesarDatosEvapotranspiracion();
        this.renderizarGraficos();
      }
    }, 3500);
  }

  /**
   * Configura un ResizeObserver para detectar cambios en los contenedores de gráficos
   */
  private setupResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    this.resizeObserver = new ResizeObserver((entries) => {
      if (this.isResizing) return;

      for (const entry of entries) {
        const target = entry.target as HTMLElement;
      }

      // Debounce para evitar llamadas excesivas
      this.isResizing = true;
      setTimeout(() => {
        this.redimensionarGraficos();
        this.isResizing = false;
      }, 300);
    });

    // Observar los contenedores de gráficos cuando estén disponibles
    setTimeout(() => {
      if (this.chartContainer?.nativeElement) {
        this.resizeObserver?.observe(this.chartContainer.nativeElement);
      }
      if (this.heatmapContainer?.nativeElement) {
        this.resizeObserver?.observe(this.heatmapContainer.nativeElement);
      }
      if (this.evapotranspiracionContainer?.nativeElement) {
        this.resizeObserver?.observe(this.evapotranspiracionContainer.nativeElement);
      }
    }, 1000);
  }

  private generarLabelsUltimos7Dias(): void {
    const diasParaLabels: Date[] = [];

    // Crear fechas normalizadas en UTC para evitar problemas de zona horaria
    const hoy = new Date();

    for (let i = 6; i >= 0; i--) {
      const fecha = new Date();
      fecha.setDate(fecha.getDate() - i);

      // Normalizar en UTC para consistencia con otros componentes
      const fechaNormalizada = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
      diasParaLabels.push(fechaNormalizada);
    }

    this.labelsUltimos7Dias = diasParaLabels.map((dia) => this.helper.nombreCortoDia(dia.toISOString()));
  }

  private async cargarDispositivosHumedad(): Promise<void> {
    if (this.lote?.dispositivos) {
      this.dispositivosHumedad = this.lote.dispositivos.filter(
        (dispositivo: IDispositivo) => dispositivo.tipo === 'Sensor de Humedad de Suelo'
      );

      // Log para ver la estructura del ultimoReporte
      if (this.dispositivosHumedad.length > 0) {
      }

      if (this.dispositivosHumedad.length > 0) {
        this.loadingGrafico = true;
        try {
          await this.procesarDatosParaGrafico();
          await this.procesarDatosParaHistograma();

          // Renderizar los gráficos después de procesar los datos
          setTimeout(() => this.renderizarGraficos(), 200);
        } catch (error) {
          console.error('Error al procesar datos para el gráfico:', error);
        } finally {
          this.loadingGrafico = false;
        }
      }
    }
  }
  private async procesarDatosParaGrafico(): Promise<void> {
    if (!this.dispositivosHumedad.length) {
      this.datosGraficoHumedad = null;
      return;
    }

    const promediosPorDia: number[] = [];
    const dispositivosConDatos: string[] = [];

    // Obtener reportes diarios para todos los dispositivos usando la ruta optimizada
    for (const dispositivo of this.dispositivosHumedad) {
      if (!dispositivo._id) {
        continue;
      }

      try {
        // Usar la ruta /reportes/diario que ya viene filtrada y optimizada (1 registro por día de ~6AM)
        const resultado = await this.reporteService.diario(dispositivo._id, 7);

        if (resultado.datos.length > 0) {
          dispositivosConDatos.push(dispositivo.nombre!);

          // Procesar cada reporte diario (ya vienen ordenados del más reciente al más antiguo)
          for (let diaIndex = 0; diaIndex < resultado.datos.length && diaIndex < 7; diaIndex++) {
            const reporte = resultado.datos[diaIndex];
            const datosLanza = this.procesarReporteLanza({ ...dispositivo, ultimoReporte: reporte });

            if (datosLanza.length > 0) {
              // Calcular promedio de humedad de los sensores de profundidad
              const promedioReporte =
                datosLanza.reduce((suma, medicion) => suma + medicion.humedad.actual, 0) / datosLanza.length;

              // Acumular para promedio general si hay múltiples dispositivos
              if (promediosPorDia[diaIndex] === undefined) {
                promediosPorDia[diaIndex] = promedioReporte;
              } else {
                promediosPorDia[diaIndex] = (promediosPorDia[diaIndex] + promedioReporte) / 2;
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error al obtener reportes diarios para dispositivo ${dispositivo.nombre}:`, error);
      }
    }

    // Verificar si hay datos
    if (dispositivosConDatos.length === 0 || promediosPorDia.every((valor) => valor === undefined)) {
      this.datosGraficoHumedad = null;
      return;
    }

    // Rellenar días sin datos con 0 y redondear valores (asegurar exactamente 7 días)
    const promediosFinales: number[] = [];
    for (let i = 0; i < 7; i++) {
      promediosFinales.push(promediosPorDia[i] !== undefined ? Math.round(promediosPorDia[i] * 10) / 10 : 0);
    }

    // Almacenar los valores para Highcharts
    this.valoresHumedadSemana = promediosFinales;

    // Reconfigurar el gráfico con la nueva escala dinámica
    this.configurarGraficoHumedad();

    this.datosGraficoHumedad = {
      labels: this.labelsUltimos7Dias, // Usar los labels pre-calculados
      datasets: [
        {
          label: 'Promedio de Humedad del Suelo',
          data: promediosFinales,
          borderColor: 'rgba(54, 162, 235, 1)',
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          tension: 0.4,
          fill: true,
          pointBackgroundColor: 'rgba(54, 162, 235, 1)',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 5,
        },
      ],
    };

    console.log(
      `Gráfico de humedad cargado con datos de ${dispositivosConDatos.length} dispositivo(s):`,
      dispositivosConDatos,
      `Escala dinámica aplicada: ${this.calcularEscalaDinamica(promediosFinales).min}% - ${this.calcularEscalaDinamica(promediosFinales).max}%`
    );
  }

  private procesarReporteLanza(dispositivo: IDispositivo): MedicionProfundidad[] {
    const ultimoReporte = dispositivo.ultimoReporte;
    const reportHumedad = ultimoReporte?.datos?.valores?.['Humedad Suelo Profundidad'];
    const reportTemp = ultimoReporte?.datos?.valores?.['Temperatura Suelo'];

    if (!Array.isArray(reportHumedad) || !Array.isArray(reportTemp)) {
      return [];
    }

    return reportHumedad.reduce((acc: MedicionProfundidad[], medicionHumedad) => {
      const medicionTemp = reportTemp.find((temp: any) => temp.profundidad === medicionHumedad.profundidad);

      if (
        medicionHumedad.profundidad != null &&
        medicionHumedad.valores?.actual != null &&
        medicionHumedad.unidad &&
        medicionTemp &&
        medicionTemp.valores?.actual != null &&
        medicionTemp.unidad
      ) {
        acc.push({
          profundidad: medicionHumedad.profundidad,
          humedad: {
            actual: medicionHumedad.valores.actual,
            unidad: medicionHumedad.unidad,
          },
          temperatura: {
            actual: medicionTemp.valores.actual,
            unidad: medicionTemp.unidad,
          },
        });
      }

      return acc;
    }, []);
  }

  private getColorForDevice(index: number, alpha: number = 1): string {
    const colors = [
      `rgba(54, 162, 235, ${alpha})`, // Blue
      `rgba(255, 99, 132, ${alpha})`, // Red
      `rgba(75, 192, 192, ${alpha})`, // Green
      `rgba(255, 206, 86, ${alpha})`, // Yellow
      `rgba(153, 102, 255, ${alpha})`, // Purple
    ];
    return colors[index % colors.length];
  }

  private calcularEscalaDinamica(valores: number[]): { min: number; max: number } {
    // Filtrar valores válidos (> 0)
    const valoresValidos = valores.filter((v) => v > 0);

    if (valoresValidos.length === 0) {
      return { min: 0, max: 100 }; // Escala por defecto si no hay datos
    }

    const minValor = Math.min(...valoresValidos);
    const maxValor = Math.max(...valoresValidos);

    // Calcular 10% por debajo del mínimo y 10% por encima del máximo
    const margenInferior = minValor * 0.9;
    const margenSuperior = maxValor * 1.1;

    // Redondear al múltiplo de 10 más cercano
    // Para el mínimo: redondear hacia abajo (ej: 12% -> 10%)
    const minEscala = Math.max(0, Math.floor(margenInferior / 10) * 10);

    // Para el máximo: redondear hacia arriba (ej: 41% -> 50%)
    const maxEscala = Math.min(100, Math.ceil(margenSuperior / 10) * 10);

    // Asegurar que haya al menos 20% de diferencia para que el gráfico se vea bien
    const diferenciaMinima = 20;
    if (maxEscala - minEscala < diferenciaMinima) {
      const centro = (maxEscala + minEscala) / 2;
      return {
        min: Math.max(0, Math.floor((centro - diferenciaMinima / 2) / 10) * 10),
        max: Math.min(100, Math.ceil((centro + diferenciaMinima / 2) / 10) * 10),
      };
    }

    return { min: minEscala, max: maxEscala };
  }

  private configurarGraficoHumedad(): void {
    // Calcular escala dinámica basada en los datos actuales
    const escala = this.calcularEscalaDinamica(this.valoresHumedadSemana || []);

    this.chartOptionsGraficoHumedad = {
      chart: {
        type: 'line',
        backgroundColor: 'transparent',
        height: 350,
        width: null, // Permite que se ajuste al contenedor
        spacingTop: 10,
        spacingRight: 10,
        spacingBottom: 10,
        spacingLeft: 10,
      },
      title: {
        text: 'Humedad del Suelo - Últimos 7 días',
        style: { color: 'var(--text-color)', fontSize: '16px' },
      },
      xAxis: {
        categories: this.labelsUltimos7Dias,
        labels: {
          style: { color: 'var(--text-color)' },
        },
        title: {
          text: 'Día',
          style: { color: 'var(--text-color)' },
        },
      },
      yAxis: {
        title: {
          text: 'Humedad (%)',
          style: { color: 'var(--text-color)' },
        },
        labels: {
          style: { color: 'var(--text-color)' },
        },
        min: escala.min,
        max: escala.max,
        tickInterval: 10, // Marcas cada 10%
      },
      legend: {
        itemStyle: { color: 'var(--text-color)' },
      },
      series: [
        {
          name: 'Promedio de Humedad del Suelo',
          data: this.valoresHumedadSemana,
          color: '#42A5F5',
          type: 'line',
          marker: {
            radius: 5,
            fillColor: '#42A5F5',
            lineColor: '#fff',
            lineWidth: 2,
          },
        },
      ],
      tooltip: {
        formatter: function () {
          return `<b>${this.series.name}</b><br/>${this.x}: ${this.y}%`;
        },
      },
      credits: {
        enabled: false,
      },
      responsive: {
        rules: [
          {
            condition: {
              maxWidth: 768,
            },
            chartOptions: {
              chart: {
                height: 300,
              },
            },
          },
        ],
      },
    };
  }

  private async procesarDatosParaHistograma(): Promise<void> {
    if (!this.dispositivosHumedad.length) {
      this.datosHistogramaHumedad = null;
      return;
    }

    // Crear una matriz completa para el heatmap y recopilar profundidades únicas
    const matrizCompleta = new Map<string, { suma: number; count: number }>();
    const profundidadesSet = new Set<number>();

    // Obtener reportes diarios para todos los dispositivos usando la ruta optimizada
    for (const dispositivo of this.dispositivosHumedad) {
      if (!dispositivo._id) continue;

      try {
        // Usar la ruta /reportes/diario que ya devuelve 1 registro por día de los últimos 7 días
        const resultado = await this.reporteService.diario(dispositivo._id, 7);

        // Procesar cada reporte diario (ya viene filtrado y optimizado por el backend)
        for (let diaIndex = 0; diaIndex < resultado.datos.length; diaIndex++) {
          const reporte = resultado.datos[diaIndex];
          const datosLanza = this.procesarReporteLanza({ ...dispositivo, ultimoReporte: reporte });

          // Para cada profundidad encontrada, agregar a la matriz y al conjunto de profundidades
          datosLanza.forEach((medicion) => {
            if (medicion.humedad.actual > 0 && medicion.humedad.actual <= 100) {
              // Validación mejorada
              const profundidad = medicion.profundidad;
              profundidadesSet.add(profundidad);

              const clave = `${diaIndex}-${profundidad}`;

              // Acumular valores correctamente para múltiples dispositivos
              if (matrizCompleta.has(clave)) {
                const datos = matrizCompleta.get(clave)!;
                datos.suma += medicion.humedad.actual;
                datos.count += 1;
              } else {
                matrizCompleta.set(clave, { suma: medicion.humedad.actual, count: 1 });
              }
            }
          });
        }
      } catch (error) {
        console.error(`Error al obtener reportes para heatmap de ${dispositivo.nombre}:`, error);
      }
    }

    // Convertir el Set a array y ordenar las profundidades
    this.profundidadesUnicas = Array.from(profundidadesSet).sort((a, b) => a - b);

    // Crear la matriz completa de datos para el heatmap
    const datosHeatmap: Array<[number, number, number | null]> = [];

    // Generar todas las combinaciones posibles de día x profundidad real
    for (let diaIndex = 0; diaIndex < 7; diaIndex++) {
      for (let profundidadIndex = 0; profundidadIndex < this.profundidadesUnicas.length; profundidadIndex++) {
        const profundidadReal = this.profundidadesUnicas[profundidadIndex];
        const clave = `${diaIndex}-${profundidadReal}`;
        const datos = matrizCompleta.get(clave);

        // Calcular promedio real y agregar solo valores válidos
        if (datos && datos.count > 0) {
          const promedio = datos.suma / datos.count;
          datosHeatmap.push([diaIndex, profundidadIndex, Math.round(promedio * 10) / 10]); // Redondear a 1 decimal
        } else {
          datosHeatmap.push([diaIndex, profundidadIndex, null]);
        }
      }
    }

    // Almacenar los datos para Highcharts heatmap
    this.valoresHistograma = datosHeatmap;
  }

  private configurarHistogramaHumedad(): void {
    this.chartOptionsHistograma = {
      chart: {
        type: 'heatmap',
        backgroundColor: 'transparent',
        height: 400,
        width: null,
        spacingTop: 10,
        spacingRight: 10,
        spacingBottom: 10,
        spacingLeft: 10,
      },
      title: {
        text: '', // Sin título propio del gráfico
      },
      xAxis: {
        categories: this.labelsUltimos7Dias,
        labels: {
          style: { color: 'var(--text-color)' },
        },
        title: {
          text: 'Días (últimos 7)',
          style: { color: 'var(--text-color)' },
        },
      },
      yAxis: {
        categories: this.profundidadesUnicas.map((p) => `${p}cm`),
        title: {
          text: 'Profundidad del Suelo',
          style: { color: 'var(--text-color)' },
        },
        labels: {
          style: { color: 'var(--text-color)' },
        },
        reversed: true, // Invertir para que lo menos profundo esté arriba
      },
      colorAxis: {
        min: 0,
        max: 50,
        stops: [
          [0, 'rgba(255, 255, 0, 0.8)'], // Amarillo para 0% (seco)
          [0.2, 'rgba(191, 191, 64, 0.8)'], // Amarillo-verdoso para 10%
          [0.4, 'rgba(128, 128, 128, 0.8)'], // Gris para 20% (medio)
          [0.6, 'rgba(64, 114, 191, 0.8)'], // Azul intermedio para 30%
          [0.8, 'rgba(0, 100, 255, 0.8)'], // Azul para 40% (húmedo)
          [0.82, 'rgba(128, 0, 128, 0.8)'], // Violeta para 41%+ (muy húmedo)
          [1, 'rgba(128, 0, 128, 0.8)'], // Violeta para 50%+ (muy húmedo)
        ],
        labels: {
          style: { color: 'var(--text-color)' },
          format: '{value}%',
        },
      },
      legend: {
        enabled: false, // Quitar la leyenda del heatmap para evitar que achique el gráfico
      },
      series: [
        {
          name: 'Humedad del Suelo',
          data: this.valoresHistograma,
          type: 'heatmap',
          borderWidth: 1,
          borderColor: 'rgba(200,200,200,0.3)',
          dataLabels: {
            enabled: false,
          },
          nullColor: 'transparent', // Celdas sin datos transparentes
          colsize: 1, // Asegurar que cada columna tenga el mismo ancho
          rowsize: 1, // Asegurar que cada fila tenga la misma altura
        },
      ],
      tooltip: {
        formatter: function () {
          const point = this.point as any;
          const humedad = point.value;
          const diaIndex = this.point.x || 0;
          const profundidadIndex = this.point.y || 0;
          const categories = this.series.chart.xAxis[0].categories;
          const profundidades = this.series.chart.yAxis[0].categories;
          const nombreDia = categories && diaIndex < categories.length ? categories[diaIndex] : `Día ${diaIndex}`;
          const nombreProfundidad =
            profundidades && profundidadIndex < profundidades.length
              ? profundidades[profundidadIndex]
              : `Profundidad ${profundidadIndex}`;

          // Si no hay datos, mostrar mensaje correspondiente
          if (humedad === null || humedad === undefined) {
            return `<b>${nombreDia}</b><br/>${nombreProfundidad}<br/>Sin datos`;
          }

          return `<b>${nombreDia}</b><br/>${nombreProfundidad}<br/>Humedad: ${humedad.toFixed(1)}%`;
        },
      },
      credits: {
        enabled: false,
      },
      responsive: {
        rules: [
          {
            condition: {
              maxWidth: 768,
            },
            chartOptions: {
              chart: {
                height: 350,
              },
              legend: {
                symbolHeight: 200,
              },
            },
          },
        ],
      },
    };
  }

  private renderizarGraficos(): void {
    // Verificar que el drawer esté visible antes de renderizar
    if (!this.visible) {
      return;
    }

    // Verificar el tipo de dispositivo y seleccionar contenedores apropiados
    this.helper.isWide$
      .subscribe((isWide) => {
        const chartContainer = isWide ? this.chartContainer : this.chartContainerMobile;
        const heatmapContainer = isWide ? this.heatmapContainer : this.heatmapContainerMobile;
        const evapotranspiracionContainer = isWide
          ? this.evapotranspiracionContainer
          : this.evapotranspiracionContainerMobile;

        // Esperar un poco más en iOS para asegurar que el DOM esté completamente listo
        const delay = 500; // Incrementar el delay para iOS significativamente

        setTimeout(() => {
          this.renderizarGraficoLineas(chartContainer);
          this.renderizarHeatmap(heatmapContainer);
          this.renderizarEvapotranspiracion(evapotranspiracionContainer);
        }, delay);
      })
      .unsubscribe(); // Unsubscribir inmediatamente ya que solo necesitamos el valor actual
  }

  private renderizarGraficoLineas(container?: ElementRef): void {
    if (container?.nativeElement && this.chartOptionsGraficoHumedad && this.valoresHumedadSemana.length > 0) {
      const containerWidth = container.nativeElement.offsetWidth;
      const containerHeight = container.nativeElement.offsetHeight;

      if (containerWidth > 0 && containerHeight > 0) {
        // Destruir instancia anterior si existe
        if (this.chartInstance) {
          this.chartInstance.destroy();
          this.chartInstance = undefined;
        }

        // Actualizar los datos en las opciones del gráfico
        const optionsWithData = {
          ...this.chartOptionsGraficoHumedad,
          chart: {
            ...this.chartOptionsGraficoHumedad.chart,
            width: containerWidth,
            height: containerHeight || 350,
            animation: false, // Deshabilitar animaciones para mejor rendimiento en iOS
          },
          series: [
            {
              name: 'Promedio de Humedad del Suelo',
              data: this.valoresHumedadSemana,
              color: '#42A5F5',
              type: 'line' as const,
              marker: {
                radius: 5,
                fillColor: '#42A5F5',
                lineColor: '#fff',
                lineWidth: 2,
              },
            },
          ],
        };

        try {
          this.chartInstance = Highcharts.chart(container.nativeElement, optionsWithData);
        } catch (error) {
          console.error('❌ Error al renderizar gráfico de líneas:', error);
        }
      } else {
        // Reintentar después de un momento en iOS
        setTimeout(() => {
          if (container?.nativeElement && container.nativeElement.offsetWidth > 0) {
            this.renderizarGraficoLineas(container);
          }
        }, 300);
      }
    }
  }

  private renderizarHeatmap(container?: ElementRef): void {
    if (container?.nativeElement && this.chartOptionsHistograma && this.valoresHistograma.length > 0) {
      const containerWidth = container.nativeElement.offsetWidth;
      const containerHeight = container.nativeElement.offsetHeight;

      if (containerWidth > 0 && containerHeight > 0) {
        // Destruir instancia anterior si existe
        if (this.heatmapInstance) {
          this.heatmapInstance.destroy();
          this.heatmapInstance = undefined;
        }

        // Actualizar los datos en las opciones del heatmap
        const optionsWithData = {
          ...this.chartOptionsHistograma,
          chart: {
            ...this.chartOptionsHistograma.chart,
            width: containerWidth,
            height: containerHeight || 400,
            animation: false, // Deshabilitar animaciones para mejor rendimiento en iOS
          },
          yAxis: {
            ...this.chartOptionsHistograma.yAxis,
            categories: this.profundidadesUnicas.map((p) => `${p}cm`),
          },
          series: [
            {
              name: 'Humedad del Suelo',
              data: this.valoresHistograma,
              type: 'heatmap' as const,
              borderWidth: 1,
              borderColor: 'rgba(200,200,200,0.3)',
              dataLabels: {
                enabled: false,
              },
              nullColor: 'transparent',
              colsize: 1,
              rowsize: 1,
            },
          ],
        };

        try {
          this.heatmapInstance = Highcharts.chart(container.nativeElement, optionsWithData);
        } catch (error) {
          console.error('❌ Error al renderizar heatmap:', error);
        }
      } else {
        // Reintentar después de un momento en iOS
        setTimeout(() => {
          if (container?.nativeElement && container.nativeElement.offsetWidth > 0) {
            this.renderizarHeatmap(container);
          }
        }, 300);
      }
    }
  }

  private renderizarEvapotranspiracion(container?: ElementRef): void {
    if (container?.nativeElement && this.chartOptionsEvapotranspiracion && this.valoresEvapotranspiracion.length > 0) {
      const containerWidth = container.nativeElement.offsetWidth;
      const containerHeight = container.nativeElement.offsetHeight;

      if (containerWidth > 0 && containerHeight > 0) {
        // Destruir instancia anterior si existe
        if (this.evapotranspiracionInstance) {
          this.evapotranspiracionInstance.destroy();
          this.evapotranspiracionInstance = undefined;
        }

        // Actualizar los datos en las opciones del gráfico
        const optionsWithData = {
          ...this.chartOptionsEvapotranspiracion,
          chart: {
            ...this.chartOptionsEvapotranspiracion.chart,
            width: containerWidth,
            height: containerHeight || 350,
            animation: false, // Deshabilitar animaciones para mejor rendimiento en iOS
          },
          series: [
            {
              name: 'Evapotranspiración (ET0)',
              data: this.valoresEvapotranspiracion,
              color: '#26C6DA',
              type: 'column' as const,
            },
          ],
        };

        try {
          this.evapotranspiracionInstance = Highcharts.chart(container.nativeElement, optionsWithData);
        } catch (error) {
          console.error('❌ Error al renderizar gráfico de evapotranspiración:', error);
        }
      } else {
        // Reintentar después de un momento en iOS
        setTimeout(() => {
          if (container?.nativeElement && container.nativeElement.offsetWidth > 0) {
            this.renderizarEvapotranspiracion(container);
          }
        }, 300);
      }
    }
  }

  private configurarGraficoEvapotranspiracion(): void {
    this.chartOptionsEvapotranspiracion = {
      chart: {
        type: 'column',
        backgroundColor: 'transparent',
        height: 350,
        width: null,
        spacingTop: 10,
        spacingRight: 10,
        spacingBottom: 10,
        spacingLeft: 10,
      },
      title: {
        text: 'Proyección de Evapotranspiración (ET0)',
        style: { color: 'var(--text-color)', fontSize: '16px' },
      },
      xAxis: {
        categories: [], // Se llenará con las fechas de pronóstico
        labels: {
          style: { color: 'var(--text-color)' },
        },
        title: {
          text: 'Fecha',
          style: { color: 'var(--text-color)' },
        },
      },
      yAxis: {
        title: {
          text: 'ET0 (mm/día)',
          style: { color: 'var(--text-color)' },
        },
        labels: {
          style: { color: 'var(--text-color)' },
        },
        min: 0,
      },
      legend: {
        itemStyle: { color: 'var(--text-color)' },
      },
      series: [
        {
          name: 'Evapotranspiración (ET0)',
          data: this.valoresEvapotranspiracion,
          color: '#26C6DA',
          type: 'column',
        },
      ],
      tooltip: {
        formatter: function () {
          return `<b>${this.series.name}</b><br/>${this.x}: ${this.y} mm/día`;
        },
      },
      credits: {
        enabled: false,
      },
      responsive: {
        rules: [
          {
            condition: {
              maxWidth: 768,
            },
            chartOptions: {
              chart: {
                height: 300,
              },
            },
          },
        ],
      },
    };

    // Procesar datos del establecimiento si están disponibles
    this.procesarDatosEvapotranspiracion();
  }

  private procesarDatosEvapotranspiracion(): void {
    // Verificar si tenemos datos del establecimiento
    if (!this.lote?.establecimiento) {
      this.datosEvapotranspiracion = null;
      this.valoresEvapotranspiracion = [];
      return;
    }

    // Obtener datos climáticos actuales y predicción
    const climaActual = this.lote.establecimiento.climaActual;
    const prediccionClimatica = this.lote.establecimiento.prediccionClimatica;

    const fechas: string[] = [];
    const valoresET0: number[] = [];

    // Agregar dato actual si existe
    if (climaActual?.clima?.et0?.last != null && climaActual.clima.et0.last > 0) {
      const hoy = new Date();
      fechas.push(this.helper.nombreCortoDia(hoy.toISOString()));
      // Truncar a 2 decimales
      valoresET0.push(Math.round(Number(climaActual.clima.et0.last) * 100) / 100);
    }

    // Agregar datos de pronóstico si existen
    if (prediccionClimatica?.pronosticos && Array.isArray(prediccionClimatica.pronosticos)) {
      // Crear fecha de hoy normalizada en UTC para comparación correcta (similar al drawer-clima)
      const hoy = new Date();
      const hoyNormalizada = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));

      for (let i = 0; i < Math.min(prediccionClimatica.pronosticos.length, 6); i++) {
        const pronostico = prediccionClimatica.pronosticos[i];

        if (pronostico.fecha && pronostico.et0 != null) {
          const fechaPronostico = new Date(pronostico.fecha);

          // Normalizar fecha del pronóstico en UTC para evitar problemas de zona horaria
          const fechaNormalizada = new Date(
            Date.UTC(fechaPronostico.getUTCFullYear(), fechaPronostico.getUTCMonth(), fechaPronostico.getUTCDate())
          );

          // Filtrar el día actual - solo mostrar pronósticos futuros
          if (fechaNormalizada.getTime() <= hoyNormalizada.getTime()) {
            continue;
          }

          const nombreDia = this.helper.nombreCortoDia(fechaNormalizada.toISOString());

          // et0 puede ser un número directo o un objeto con last
          const valorET0 = typeof pronostico.et0 === 'object' ? (pronostico.et0 as any)?.last : pronostico.et0;

          if (valorET0 != null && valorET0 > 0) {
            fechas.push(nombreDia);
            // Truncar a 2 decimales
            valoresET0.push(Math.round(Number(valorET0) * 100) / 100);
          }
        }
      }
    }

    // Solo actualizar si tenemos datos
    if (valoresET0.length > 0) {
      // Actualizar datos del gráfico
      this.valoresEvapotranspiracion = valoresET0;

      // Actualizar las categorías del eje X
      if (this.chartOptionsEvapotranspiracion && this.chartOptionsEvapotranspiracion.xAxis) {
        this.chartOptionsEvapotranspiracion.xAxis = {
          ...this.chartOptionsEvapotranspiracion.xAxis,
          categories: fechas,
        };
      }

      this.datosEvapotranspiracion = {
        labels: fechas,
        datasets: [
          {
            label: 'Evapotranspiración (ET0)',
            data: valoresET0,
            backgroundColor: 'rgba(38, 198, 218, 0.6)',
            borderColor: 'rgba(38, 198, 218, 1)',
            borderWidth: 1,
          },
        ],
      };
    } else {
      this.datosEvapotranspiracion = null;
      this.valoresEvapotranspiracion = [];
    }
  }

  /**
   * Método para redimensionar los gráficos cuando cambia el tamaño de la ventana
   */
  private redimensionarGraficos(): void {
    if (!this.visible) {
      return;
    }

    // En lugar de usar reflow(), recrear los gráficos completamente para mayor compatibilidad con iOS
    let needsRerender = false;

    // Obtener las referencias correctas según el dispositivo
    this.helper.isWide$
      .subscribe((isWide) => {
        const chartContainer = isWide ? this.chartContainer : this.chartContainerMobile;
        const heatmapContainer = isWide ? this.heatmapContainer : this.heatmapContainerMobile;
        const evapotranspiracionContainer = isWide
          ? this.evapotranspiracionContainer
          : this.evapotranspiracionContainerMobile;

        // Verificar gráfico de líneas
        if (this.chartInstance && chartContainer?.nativeElement) {
          const containerWidth = chartContainer.nativeElement.offsetWidth;
          if (containerWidth > 0) {
            const chartWidth = this.chartInstance.chartWidth;
            if (Math.abs(containerWidth - chartWidth) > 50) {
              this.chartInstance.destroy();
              this.chartInstance = undefined;
              needsRerender = true;
            }
          }
        }

        // Verificar heatmap
        if (this.heatmapInstance && heatmapContainer?.nativeElement) {
          const containerWidth = heatmapContainer.nativeElement.offsetWidth;
          if (containerWidth > 0) {
            const chartWidth = this.heatmapInstance.chartWidth;
            if (Math.abs(containerWidth - chartWidth) > 50) {
              this.heatmapInstance.destroy();
              this.heatmapInstance = undefined;
              needsRerender = true;
            }
          }
        }

        // Verificar gráfico de evapotranspiración
        if (this.evapotranspiracionInstance && evapotranspiracionContainer?.nativeElement) {
          const containerWidth = evapotranspiracionContainer.nativeElement.offsetWidth;
          if (containerWidth > 0) {
            const chartWidth = this.evapotranspiracionInstance.chartWidth;
            if (Math.abs(containerWidth - chartWidth) > 50) {
              this.evapotranspiracionInstance.destroy();
              this.evapotranspiracionInstance = undefined;
              needsRerender = true;
            }
          }
        }

        // Re-renderizar si es necesario
        if (needsRerender) {
          setTimeout(() => {
            this.renderizarGraficos();
          }, 200); // Incrementar delay para iOS
        }
      })
      .unsubscribe();
  }
}
