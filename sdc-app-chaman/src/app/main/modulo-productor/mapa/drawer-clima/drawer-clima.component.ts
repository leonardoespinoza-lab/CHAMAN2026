import {
  Component,
  ElementRef,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import * as Highcharts from 'highcharts';
import { IEstablecimiento } from 'modelos/src';
import { Subscription } from 'rxjs';
import { ClimaTraduccionService } from '../../../../auxiliares/servicios/clima-traduccion.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../auxiliares/shared.module';

@Component({
  selector: 'app-drawer-clima',
  imports: [SharedModule],
  templateUrl: './drawer-clima.component.html',
  styleUrl: './drawer-clima.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DrawerClimaComponent implements OnInit, OnDestroy, OnChanges {
  @ViewChild('chartContainer', { static: false }) chartContainer?: ElementRef;
  @ViewChild('precipitationChartContainer', { static: false }) precipitationChartContainer?: ElementRef;

  @Input() establecimiento?: IEstablecimiento;
  @Input() visible = false;

  // Datos procesados para la vista
  public climaActual: any = null;
  public prediccionClimatica: any = null;
  public pronosticosDias: any[] = [];

  // Configuración del gráfico
  public chartOptions?: Highcharts.Options;
  public chartPrecipitacionOptions?: Highcharts.Options;
  private chartInstance?: Highcharts.Chart;
  private precipitationChartInstance?: Highcharts.Chart;
  private isResizing = false;

  // Subscripciones
  private subscripciones: Subscription[] = [];

  constructor(
    private helperService: HelperService,
    private climaTraduccionService: ClimaTraduccionService
  ) {}

  // Getter para acceder al helper en el template
  get helper() {
    return this.helperService;
  }

  // Listener para redimensionar gráficos cuando cambia el tamaño de la ventana
  @HostListener('window:resize', ['$event'])
  onWindowResize(event: any): void {
    if (this.isResizing) return; // Evitar llamadas múltiples

    this.isResizing = true;

    // Usar setTimeout para dar tiempo a que se complete el cambio de layout
    setTimeout(() => {
      this.renderizarGrafico();
      this.isResizing = false;
    }, 500);
  }

  ngOnInit() {
    if (this.establecimiento) {
      this.cargarDatosClima();
    }
  }

  ngOnDestroy() {
    this.subscripciones.forEach((sub) => sub.unsubscribe());

    // Destruir instancias de los gráficos si existen
    if (this.chartInstance) {
      this.chartInstance.destroy();
    }
    if (this.precipitationChartInstance) {
      this.precipitationChartInstance.destroy();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['establecimiento'] && this.establecimiento) {
      this.cargarDatosClima();
    }

    // Si el drawer se hace visible y ya tenemos datos, renderizar los gráficos
    if (changes['visible'] && this.visible && this.chartOptions && this.pronosticosDias.length > 0) {
      // Usar un delay más largo para asegurar que el drawer esté completamente renderizado
      setTimeout(() => {
        this.renderizarGrafico();
      }, 300);
    }
  }

  private cargarDatosClima() {
    if (!this.establecimiento?.nombre) return;

    this.climaActual = null;
    this.prediccionClimatica = null;
    this.pronosticosDias = [];

    // Los datos de clima ya vienen en el establecimiento desde mapa.component
    // No necesitamos hacer llamadas HTTP adicionales
    if (this.establecimiento.climaActual) {
      this.procesarDatosClima(this.establecimiento.climaActual);
    }

    if (this.establecimiento.prediccionClimatica) {
      this.procesarDatosPronostico(this.establecimiento.prediccionClimatica);
    }

    this.completarClimaActualConPronostico();
  }

  private procesarDatosClima(climaData: any) {
    if (climaData) {
      const clima = Array.isArray(climaData.clima)
        ? climaData.clima[climaData.clima.length - 1]
        : climaData.clima || climaData;
      this.climaActual = {
        clima,
        fecha: new Date(climaData.fecha),
      };
    }
  }

  private procesarDatosPronostico(prediccionData: any) {
    if (prediccionData) {
      this.prediccionClimatica = {
        clima: prediccionData,
        fecha: new Date(),
      };

      if (this.prediccionClimatica?.clima?.pronosticos && Array.isArray(this.prediccionClimatica.clima.pronosticos)) {
        this.pronosticosDias = [];
        // Crear fecha de hoy normalizada (solo fecha, sin hora) en UTC para comparación correcta
        const hoy = new Date();
        const hoyNormalizada = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));

        this.prediccionClimatica.clima.pronosticos.forEach((pronostico: any, index: number) => {
          const fechaPronostico = new Date(pronostico.fecha);
          const fechaNormalizada = new Date(
            Date.UTC(fechaPronostico.getUTCFullYear(), fechaPronostico.getUTCMonth(), fechaPronostico.getUTCDate())
          );
        });

        // Filtrar pronósticos para excluir el día actual (hoy)
        const pronosticosFiltrados = this.prediccionClimatica.clima.pronosticos.filter((pronostico: any) => {
          const fechaPronostico = new Date(pronostico.fecha);
          const fechaNormalizada = new Date(
            Date.UTC(fechaPronostico.getUTCFullYear(), fechaPronostico.getUTCMonth(), fechaPronostico.getUTCDate())
          );
          return fechaNormalizada.getTime() > hoyNormalizada.getTime(); // Solo pronósticos futuros
        });

        for (const pronostico of pronosticosFiltrados) {
          const tempMax = pronostico.temperatura?.max;
          const tempMin = pronostico.temperatura?.min;
          const humedad = pronostico.humedad?.avg;
          const precipitacion = pronostico.lluvia || 0;
          const probabilidadPrecipitacion = pronostico.probabilidadLluvia || 0;
          const velocidadViento = pronostico.velocidadViento?.avg;
          const iconNum = pronostico.iconNum;

          // Generar descripción basada en los datos
          let descripcion = 'Clima despejado';
          if (precipitacion > 5) {
            descripcion = 'Lluvia moderada';
          } else if (precipitacion > 0) {
            descripcion = 'Lluvia ligera';
          } else if (humedad && humedad > 80) {
            descripcion = 'Nublado';
          }

          const descripcionTraducida = this.climaTraduccionService.traducirDescripcion(descripcion);

          this.pronosticosDias.push({
            fecha: new Date(pronostico.fecha),
            dia: new Date(pronostico.fecha).toLocaleDateString('es', { weekday: 'short' }),
            tempMax: tempMax,
            tempMin: tempMin,
            humedad: humedad,
            precipitacion: precipitacion,
            probabilidadPrecipitacion: probabilidadPrecipitacion,
            velocidadViento: velocidadViento,
            iconNum: iconNum,
            summary: descripcionTraducida,
            summaryOriginal: descripcion,
            et0: pronostico.et0,
          });
        }
      }

      // Generar gráfico después de procesar los datos
      this.completarClimaActualConPronostico();
      this.generarGraficoPronostico();

      // Renderizar el gráfico después de un pequeño delay para asegurar que el DOM esté listo
      setTimeout(() => {
        this.renderizarGrafico();
      }, 200);
    }
  }

  private completarClimaActualConPronostico() {
    if (this.tieneClimaActualUtil() || !this.pronosticosDias.length) {
      return;
    }

    const pronostico = this.pronosticosDias[0];
    this.climaActual = {
      fecha: pronostico.fecha || new Date(),
      clima: {
        fuente: 'OpenMeteo',
        iconNum: pronostico.iconNum || 1,
        summary: pronostico.summaryOriginal || pronostico.summary || 'Pronostico Open-Meteo',
        temperatura: {
          last: pronostico.tempMax ?? pronostico.temperatura?.avg,
          avg: pronostico.temperatura?.avg,
          max: pronostico.tempMax,
          min: pronostico.tempMin,
        },
        humedad: {
          last: pronostico.humedad,
          avg: pronostico.humedad,
        },
        velocidadViento: {
          last: pronostico.velocidadViento,
          avg: pronostico.velocidadViento,
        },
        lluvia: {
          last: pronostico.precipitacion,
          sum: pronostico.precipitacion,
          result: pronostico.precipitacion,
        },
        et0: {
          last: pronostico.et0,
          result: pronostico.et0,
        },
      },
    };
  }

  private tieneClimaActualUtil(): boolean {
    const clima = this.climaActual?.clima;
    return !!(
      clima &&
      (clima.temperatura?.last !== undefined ||
        clima.temperatura?.avg !== undefined ||
        clima.humedad?.last !== undefined ||
        clima.humedad?.avg !== undefined)
    );
  }

  private generarGraficoPronostico() {
    if (this.pronosticosDias.length === 0) return;

    // Preparar datos para el gráfico
    const temperaturasMax = this.pronosticosDias.map((dia) => dia.tempMax || null);
    const temperaturasMin = this.pronosticosDias.map((dia) => dia.tempMin || null);
    const humedades = this.pronosticosDias.map((dia) => dia.humedad || null);
    const precipitaciones = this.pronosticosDias.map((dia) => dia.precipitacion || 0);

    // Generar categorías para el eje X
    const hoy = new Date();
    const hoyNormalizada = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));

    const categorias = this.pronosticosDias.map((dia, index) => {
      const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

      // Normalizar fecha del pronóstico en UTC para comparación correcta
      const fechaPronostico = new Date(dia.fecha);
      const fechaNormalizada = new Date(
        Date.UTC(fechaPronostico.getUTCFullYear(), fechaPronostico.getUTCMonth(), fechaPronostico.getUTCDate())
      );

      // Crear fecha de mañana normalizada en UTC
      const manana = new Date(hoyNormalizada.getTime() + 24 * 60 * 60 * 1000);

      // Como ya filtramos el día actual, el primer día debería ser mañana
      if (fechaNormalizada.getTime() === manana.getTime()) {
        return 'Mañana';
      } else {
        return dayNames[fechaPronostico.getUTCDay()]; // Usar getUTCDay() para consistencia
      }
    });

    this.chartOptions = {
      chart: {
        type: 'line',
        backgroundColor: 'transparent',
        height: 340,
        width: null, // Permite que se ajuste al contenedor como en drawer-riego
        spacingTop: 10,
        spacingRight: 10,
        spacingBottom: 10,
        spacingLeft: 10,
        style: {
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
      },
      title: {
        text: `Pronóstico ${this.pronosticosDias.length} días`, // Mostrar cantidad real de días
        style: {
          fontSize: '13px',
          fontWeight: '600',
          color: 'var(--p-text-color)',
        },
        margin: 6,
      },
      subtitle: {
        text: undefined, // Eliminado subtítulo para ahorrar espacio
      },
      xAxis: {
        categories: categorias,
        labels: {
          style: {
            color: 'var(--p-text-color)',
            fontSize: '11px',
          },
          rotation: 0,
          align: 'center',
        },
        lineColor: 'var(--p-surface-border)',
        tickColor: 'var(--p-surface-border)',
        gridLineColor: 'var(--p-surface-border)',
        gridLineWidth: 0.5,
        tickLength: 5,
      },
      yAxis: [
        {
          // Eje principal - Temperatura (lado izquierdo)
          title: {
            text: undefined, // Quitar título para ahorrar espacio
          },
          labels: {
            style: {
              color: '#666666',
              fontSize: '11px',
            },
            formatter: function () {
              return this.value + '°C';
            },
          },
          gridLineColor: '#e6e6e6',
          gridLineWidth: 1,
          lineColor: '#cccccc',
          lineWidth: 1,
          tickColor: '#cccccc',
          opposite: false,
          showEmpty: false,
        },
        {
          // Eje secundario - Humedad (lado derecho)
          title: {
            text: undefined, // Quitar título para ahorrar espacio
          },
          labels: {
            style: {
              color: '#666666',
              fontSize: '11px',
            },
            formatter: function () {
              return this.value + '%';
            },
          },
          max: 100,
          min: 0,
          opposite: true,
          gridLineWidth: 0,
          lineColor: '#cccccc',
          lineWidth: 1,
          tickColor: '#cccccc',
          showEmpty: false,
        },
      ],
      tooltip: {
        shared: true,
        backgroundColor: 'var(--p-content-background)',
        borderColor: 'var(--p-surface-border)',
        borderWidth: 1,
        borderRadius: 8,
        shadow: true,
        style: {
          color: 'var(--p-text-color)',
          fontSize: '12px',
        },
        formatter: function () {
          // En Highcharts, this.x ya contiene directamente el valor de la categoría (el nombre del día)
          const categoriaLabel = this.x as string;

          let tooltip = `<strong>${categoriaLabel}</strong><br/>`;

          this.points?.forEach((point) => {
            const color = point.series.color;
            const value = point.y;
            let unit = '';

            if (point.series.name.includes('Temp')) {
              unit = '°C';
            } else if (point.series.name.includes('Humedad')) {
              unit = '%';
            }

            tooltip += `<span style="color:${color}">●</span> ${point.series.name}: <strong>${value}${unit}</strong><br/>`;
          });

          return tooltip;
        },
      },
      legend: {
        enabled: true,
        align: 'center',
        verticalAlign: 'bottom',
        layout: 'horizontal',
        itemStyle: {
          color: 'var(--p-text-color)',
          fontSize: '10px',
          fontWeight: '500',
        },
        itemHoverStyle: {
          color: 'var(--p-text-color)',
        },
        itemHiddenStyle: {
          color: 'var(--p-text-color-secondary)',
        },
        symbolHeight: 8,
        symbolWidth: 10,
        symbolRadius: 4,
        margin: 20, // Más margen para separar de las etiquetas del eje X
        itemMarginTop: 5,
        itemMarginBottom: 5,
        itemDistance: 15,
        y: 10, // Empujar la leyenda hacia abajo
      },
      series: [
        {
          name: 'Temp. Máxima',
          data: temperaturasMax,
          type: 'areaspline',
          yAxis: 0,
          color: '#e74c3c',
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [
              [0, 'rgba(231, 76, 60, 0.2)'],
              [1, 'rgba(231, 76, 60, 0.05)'],
            ],
          },
          marker: {
            enabled: true,
            radius: 3, // Reducir tamaño del marcador
            fillColor: '#e74c3c',
          },
        },
        {
          name: 'Temp. Mínima',
          data: temperaturasMin,
          type: 'areaspline',
          yAxis: 0,
          color: '#3498db',
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [
              [0, 'rgba(52, 152, 219, 0.2)'],
              [1, 'rgba(52, 152, 219, 0.05)'],
            ],
          },
          marker: {
            enabled: true,
            radius: 3, // Reducir tamaño del marcador
            fillColor: '#3498db',
          },
        },
        {
          name: 'Humedad',
          data: humedades,
          type: 'spline',
          yAxis: 1,
          color: '#2ecc71',
          dashStyle: 'ShortDash',
          marker: {
            enabled: true,
            radius: 2, // Marcador más pequeño para humedad
            fillColor: '#2ecc71',
          },
        },
      ],
      credits: {
        enabled: false,
      },
      plotOptions: {
        series: {
          animation: {
            duration: 1000,
            easing: 'easeOutQuart',
          },
        },
        column: {
          borderWidth: 0,
          borderRadius: 2,
          pointWidth: 15, // Puntos más pequeños para columnas
        },
        areaspline: {
          lineWidth: 2,
        },
        spline: {
          lineWidth: 2,
        },
      },
      responsive: {
        rules: [
          {
            condition: {
              maxWidth: 768,
            },
            chartOptions: {
              chart: {
                height: 340,
              },
              title: {
                style: {
                  fontSize: '12px',
                },
              },
              yAxis: [
                {
                  title: {
                    text: undefined, // Sin título en móvil tampoco
                  },
                  labels: {
                    style: {
                      fontSize: '10px',
                    },
                  },
                },
                {
                  title: {
                    text: undefined, // Sin título en móvil tampoco
                  },
                  labels: {
                    style: {
                      fontSize: '10px',
                    },
                  },
                },
              ],
              legend: {
                itemStyle: {
                  fontSize: '9px',
                },
              },
            },
          },
        ],
      },
    };
  }

  // Métodos auxiliares para el resumen
  public getTemperatureRange(): string {
    if (this.pronosticosDias.length === 0) return '--';

    const temps = this.pronosticosDias.flatMap((dia) => [dia.tempMax, dia.tempMin]).filter((t) => t != null);
    const minTemp = Math.min(...temps);
    const maxTemp = Math.max(...temps);

    return `${minTemp}°C - ${maxTemp}°C`;
  }

  public getAverageHumidity(): number {
    if (this.pronosticosDias.length === 0) return 0;

    const humedades = this.pronosticosDias.map((dia) => dia.humedad).filter((h) => h != null);
    const promedio = humedades.reduce((sum, h) => sum + h, 0) / humedades.length;

    return Math.round(promedio);
  }

  public getTotalPrecipitation(): number {
    if (this.pronosticosDias.length === 0) return 0;

    const precipitaciones = this.pronosticosDias.map((dia) => dia.precipitacion || 0);
    const total = precipitaciones.reduce((sum, p) => sum + p, 0);

    return Math.round(total * 10) / 10; // Redondear a 1 decimal
  }

  // Métodos de formateo
  public formatearTemperatura(temp: number | null | undefined): string {
    return temp != null ? `${Math.round(temp)}°C` : '--';
  }

  public formatearHumedad(humedad: number | null | undefined): string {
    return humedad != null ? `${Math.round(humedad)}%` : '--';
  }

  public formatearViento(velocidad: number | null | undefined): string {
    return velocidad != null ? `${Math.round(velocidad)} km/h` : '--';
  }

  public formatearPresion(presion: number | null | undefined): string {
    return presion != null ? `${Math.round(presion)} hPa` : '--';
  }

  public formatearET0(et0: number | null | undefined): string {
    return et0 != null ? `${et0.toFixed(1)} mm` : '--';
  }

  public formatearDireccionViento(grados: number | null | undefined): string {
    if (grados == null) return '--';

    // Convertir grados a puntos cardinales
    const direcciones = [
      'N',
      'NNE',
      'NE',
      'ENE',
      'E',
      'ESE',
      'SE',
      'SSE',
      'S',
      'SSW',
      'SW',
      'WSW',
      'W',
      'WNW',
      'NW',
      'NNW',
    ];
    const indice = Math.round(grados / 22.5) % 16;
    return direcciones[indice];
  }

  public formatearRadiacionSolar(radiacion: number | null | undefined): string {
    return radiacion != null ? `${Math.round(radiacion)} W/m²` : '--';
  }

  public getIconUrl(iconNum: number | null | undefined): string {
    return iconNum ? `https://www.meteosource.com/static/img/ico/weather/${iconNum}.svg` : '';
  }

  /**
   * Obtiene la descripción del clima traducida al español
   * @param descripcionOriginal - Descripción original del clima (normalmente en inglés)
   * @returns Descripción traducida al español
   */
  public getDescripcionClimaTraducida(descripcionOriginal: string | undefined): string {
    if (!descripcionOriginal) {
      return 'Indeterminado';
    }
    return this.climaTraduccionService.traducirDescripcion(descripcionOriginal);
  }

  private renderizarGrafico(): void {
    if (!this.visible) {
      return;
    }

    // Renderizar gráfico de pronóstico
    if (this.chartContainer?.nativeElement && this.chartOptions && this.pronosticosDias.length > 0) {
      const containerWidth = this.chartContainer.nativeElement.offsetWidth;
      const containerHeight = this.chartContainer.nativeElement.offsetHeight;

      if (containerWidth > 0 && containerHeight > 0) {
        // Destruir instancia anterior si existe
        if (this.chartInstance) {
          this.chartInstance.destroy();
        }

        // Actualizar las dimensiones en las opciones del gráfico
        const optionsWithDimensions = {
          ...this.chartOptions,
          chart: {
            ...this.chartOptions.chart,
            width: containerWidth,
            height: containerHeight || 450, // Aumentar altura de fallback
          },
        };

        // Crear nueva instancia del gráfico
        this.chartInstance = Highcharts.chart(this.chartContainer.nativeElement, optionsWithDimensions);
      }
    }
  }

  private renderizarGraficoPrecipitaciones(): void {
    if (!this.visible) {
      return;
    }

    // Renderizar gráfico de precipitaciones
    if (
      this.precipitationChartContainer?.nativeElement &&
      this.chartPrecipitacionOptions &&
      this.pronosticosDias.length > 0
    ) {
      const containerWidth = this.precipitationChartContainer.nativeElement.offsetWidth;
      const containerHeight = this.precipitationChartContainer.nativeElement.offsetHeight;

      if (containerWidth > 0 && containerHeight > 0) {
        // Destruir instancia anterior si existe
        if (this.precipitationChartInstance) {
          this.precipitationChartInstance.destroy();
        }

        // Actualizar las dimensiones en las opciones del gráfico
        const optionsWithDimensions = {
          ...this.chartPrecipitacionOptions,
          chart: {
            ...this.chartPrecipitacionOptions.chart,
            width: containerWidth,
            height: containerHeight || 400,
          },
        };

        // Crear nueva instancia del gráfico
        this.precipitationChartInstance = Highcharts.chart(
          this.precipitationChartContainer.nativeElement,
          optionsWithDimensions
        );
      }
    }
  }

  private generarGraficoPrecipitaciones() {
    if (this.pronosticosDias.length === 0) return;

    // Preparar datos para el gráfico de barras de precipitaciones
    const precipitaciones = this.pronosticosDias.map((dia) => dia.precipitacion || 0);

    // Generar categorías para el eje X (reutilizar la misma lógica)
    const hoy = new Date();
    const hoyNormalizada = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));

    const categorias = this.pronosticosDias.map((dia, index) => {
      const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const fechaPronostico = new Date(dia.fecha);
      const fechaNormalizada = new Date(
        Date.UTC(fechaPronostico.getUTCFullYear(), fechaPronostico.getUTCMonth(), fechaPronostico.getUTCDate())
      );
      const manana = new Date(hoyNormalizada.getTime() + 24 * 60 * 60 * 1000);

      if (fechaNormalizada.getTime() === manana.getTime()) {
        return 'Mañana';
      } else {
        return dayNames[fechaPronostico.getUTCDay()];
      }
    });

    this.chartPrecipitacionOptions = {
      chart: {
        type: 'column',
        backgroundColor: 'transparent',
        height: 400,
        width: null,
        spacingTop: 10,
        spacingRight: 10,
        spacingBottom: 10,
        spacingLeft: 10,
        style: {
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
      },
      title: {
        text: `Precipitaciones ${this.pronosticosDias.length} días`,
        style: {
          fontSize: '13px',
          fontWeight: '600',
          color: 'var(--p-text-color)',
        },
        margin: 6,
      },
      subtitle: {
        text: undefined,
      },
      xAxis: {
        categories: categorias,
        labels: {
          style: {
            color: 'var(--p-text-color)',
            fontSize: '11px',
          },
          rotation: 0,
          align: 'center',
        },
        lineColor: 'var(--p-surface-border)',
        tickColor: 'var(--p-surface-border)',
        gridLineColor: 'var(--p-surface-border)',
        gridLineWidth: 0.5,
        tickLength: 5,
      },
      yAxis: {
        title: {
          text: undefined,
        },
        labels: {
          style: {
            color: '#666666',
            fontSize: '11px',
          },
          formatter: function () {
            return this.value + ' mm';
          },
        },
        gridLineColor: '#e6e6e6',
        gridLineWidth: 1,
        lineColor: '#cccccc',
        lineWidth: 1,
        tickColor: '#cccccc',
        min: 0,
        showEmpty: false,
      },
      tooltip: {
        backgroundColor: 'var(--p-content-background)',
        borderColor: 'var(--p-surface-border)',
        borderWidth: 1,
        borderRadius: 8,
        shadow: true,
        style: {
          color: 'var(--p-text-color)',
          fontSize: '12px',
        },
        formatter: function () {
          // En Highcharts, this.x ya contiene directamente el valor de la categoría (el nombre del día)
          const categoriaLabel = this.x as string;

          return `<strong>${categoriaLabel}</strong><br/>
                  <span style="color:${this.point.color}">●</span> Precipitación: <strong>${this.y} mm</strong>`;
        },
      },
      legend: {
        enabled: false,
      },
      series: [
        {
          name: 'Precipitación',
          data: precipitaciones,
          type: 'column',
          color: '#3498db',
          borderRadius: 4,
          borderWidth: 0,
          dataLabels: {
            enabled: true,
            style: {
              color: 'var(--p-text-color)',
              fontSize: '10px',
              fontWeight: '500',
            },
            formatter: function () {
              return (this.y ?? 0) > 0 ? `${this.y} mm` : '';
            },
          },
        },
      ],
      credits: {
        enabled: false,
      },
      plotOptions: {
        column: {
          borderWidth: 0,
          borderRadius: 4,
          pointWidth: 25,
          groupPadding: 0.15,
          pointPadding: 0.05,
          animation: {
            duration: 1000,
            easing: 'easeOutQuart',
          },
        },
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
              title: {
                style: {
                  fontSize: '12px',
                },
              },
              yAxis: {
                labels: {
                  style: {
                    fontSize: '10px',
                  },
                },
              },
              plotOptions: {
                column: {
                  pointWidth: 20,
                },
              },
            },
          },
        ],
      },
    };
  }
}
