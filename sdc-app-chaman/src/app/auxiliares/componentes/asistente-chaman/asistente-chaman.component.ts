import { Component, Input, OnChanges } from '@angular/core';
import { Router } from '@angular/router';
import { HelperService } from '../../servicios/helper';
import { SharedModule } from '../../shared.module';

interface MensajeAsistente {
  autor: 'chaman' | 'usuario';
  texto: string;
}

@Component({
  selector: 'app-asistente-chaman',
  imports: [SharedModule],
  templateUrl: './asistente-chaman.component.html',
  styleUrl: './asistente-chaman.component.scss',
})
export class AsistenteChamanComponent implements OnChanges {
  @Input() contexto = 'general';

  public abierto = false;
  public avisoVisible = true;
  public pregunta = '';
  public mensajes: MensajeAsistente[] = [];

  constructor(
    public helper: HelperService,
    private router: Router
  ) {
    this.reiniciarConversacion();
  }

  public ngOnChanges(): void {
    if (!this.mensajes.length) {
      this.reiniciarConversacion();
      return;
    }
    this.mensajes[0] = {
      autor: 'chaman',
      texto: this.getSaludoContextual(),
    };
  }

  public toggle(): void {
    this.abierto = !this.abierto;
    if (this.abierto) {
      this.avisoVisible = false;
    }
  }

  public cerrarAviso(event: Event): void {
    event.stopPropagation();
    this.avisoVisible = false;
  }

  public preguntarRapido(tema: string): void {
    this.pregunta = tema;
    this.enviar();
  }

  public enviar(): void {
    const texto = this.pregunta.trim();
    if (!texto) return;

    this.mensajes.push({ autor: 'usuario', texto });
    this.mensajes.push({ autor: 'chaman', texto: this.responder(texto) });
    this.pregunta = '';
  }

  public irAlertas(): void {
    this.router.navigateByUrl('/alertas');
    this.abierto = false;
  }

  private reiniciarConversacion(): void {
    this.mensajes = [{ autor: 'chaman', texto: this.getSaludoContextual() }];
  }

  private getSaludoContextual(): string {
    switch (this.contexto) {
      case 'detalle-lote':
        return 'Estoy mirando este lote. Puedo ayudarte a leer riego, clima, enfermedades, sensores, camaras, huella hidrica y estado fenologico.';
      case 'mapa':
        return 'Estoy en el mapa. Puedo ayudarte a interpretar riesgo por establecimiento, clima de zona y prioridades de monitoreo.';
      case 'dispositivos':
        return 'Estoy en dispositivos. Puedo ayudarte a revisar sensores, ultimos reportes, asignaciones y calidad de senal.';
      case 'camaras':
        return 'Estoy en camaras. Puedo ayudarte a revisar capturas, seguimiento visual y alertas de malezas o estado del cultivo.';
      case 'admin':
        return 'Estoy en administracion. Puedo ayudarte con usuarios, permisos, dispositivos, algoritmos y servicios habilitados.';
      default:
        return 'Soy el asistente agronomico de Chaman. Respondo sobre cultivos, lotes, clima, riego, sensores, sanidad, camaras y gestion agronomica.';
    }
  }

  private responder(pregunta: string): string {
    const texto = pregunta.toLowerCase();
    if (!this.esPreguntaAgronomica(texto)) {
      return 'Me mantengo dentro de Chaman Agro: puedo ayudarte con lotes, cultivos, clima, riego, sensores, enfermedades, malezas, camaras, frio, heladas, huella hidrica y permisos de la plataforma.';
    }

    if (texto.includes('riego') || texto.includes('agua') || texto.includes('humedad')) {
      return 'Para riego conviene cruzar humedad de suelo por profundidad, raices activas, capacidad de campo, punto de marchitez, ET0 y pronostico. Si el lote tiene lanza asignada, esa lectura debe ser la fuente principal.';
    }

    if (texto.includes('enfermedad') || texto.includes('hongo') || texto.includes('roya') || texto.includes('sarna')) {
      return 'El riesgo sanitario debe leerse por cultivo, variedad, etapa fenologica, humedad relativa, mojado foliar, lluvia y temperatura. Si el riesgo sube, Chaman deberia mostrar ventana critica y prescripcion orientativa.';
    }

    if (texto.includes('frio') || texto.includes('helada') || texto.includes('chill')) {
      return 'En frutales, las horas frio, frio efectivo, chill portions, grados dia y riesgo de heladas son indicadores centrales. Sirven para anticipar brotacion, floracion y ventana sanitaria.';
    }

    if (texto.includes('camara') || texto.includes('foto') || texto.includes('imagen')) {
      return 'Las camaras deben aportar evidencia visual diaria. Lo ideal es comparar fechas, detectar cambios de cobertura, malezas, dano, brotacion o estado del cultivo y guardar historial por lote.';
    }

    if (texto.includes('ndvi') || texto.includes('satelital') || texto.includes('indice')) {
      return 'Los indices satelitales son complemento: NDVI vigor, NDMI/NDWI agua, NDRE clorofila y SAVI/EVI vigor ajustado. La lectura debe compararse contra clima, suelo y manejo reciente.';
    }

    if (texto.includes('permiso') || texto.includes('usuario') || texto.includes('ver')) {
      return 'Los permisos deben manejarse por nivel y por servicio visible. Desde Admin podes habilitar o quitar Sensores, Camaras, Clima, NDVI, Riego, Enfermedades, Huella y Certificados por usuario.';
    }

    return 'Para tomar una decision agronomica necesito combinar contexto del lote, cultivo, etapa fenologica, clima, sensores, manejo aplicado e historial. Puedo ayudarte a ordenar esa lectura dentro de Chaman.';
  }

  private esPreguntaAgronomica(texto: string): boolean {
    const palabras = [
      'agro',
      'cultivo',
      'lote',
      'establecimiento',
      'clima',
      'lluvia',
      'temperatura',
      'humedad',
      'riego',
      'sensor',
      'camara',
      'foto',
      'enfermedad',
      'malezas',
      'fertiliz',
      'fumig',
      'huella',
      'frio',
      'helada',
      'chill',
      'fenolog',
      'ndvi',
      'satelital',
      'indice',
      'suelo',
      'raiz',
      'rinde',
      'certificado',
      'permiso',
      'usuario',
      'quimica',
      'productor',
      'distribuidor',
    ];
    return palabras.some((palabra) => texto.includes(palabra));
  }
}
