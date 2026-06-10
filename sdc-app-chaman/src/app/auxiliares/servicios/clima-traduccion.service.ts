import { Injectable } from '@angular/core';

/**
 * Servicio para traducir descripciones meteorológicas del inglés al español
 * Proporciona una solución temporal mientras se configura el idioma en la API de Meteosource
 */
@Injectable({
  providedIn: 'root',
})
export class ClimaTraduccionService {
  // Diccionario de traducciones de términos meteorológicos comunes
  private readonly traducciones: { [key: string]: string } = {
    // Condiciones básicas
    sunny: 'Soleado',
    'partly sunny': 'Parcialmente soleado',
    'mostly sunny': 'Mayormente soleado',
    clear: 'Despejado',
    'partly cloudy': 'Parcialmente nublado',
    'mostly cloudy': 'Mayormente nublado',
    cloudy: 'Nublado',
    overcast: 'Cubierto',
    rainy: 'Lluvioso',
    drizzle: 'Llovizna',
    showers: 'Chubascos',
    thunderstorm: 'Tormenta',
    snow: 'Nieve',
    sleet: 'Aguanieve',
    fog: 'Niebla',
    mist: 'Neblina',
    haze: 'Bruma',
    windy: 'Ventoso',

    // Condiciones específicas de Meteosource
    'clear sky': 'Cielo despejado',
    'mainly clear': 'Mayormente despejado',
    'mostly clear': 'Mayormente despejado',
    'partly sunny sky': 'Cielo parcialmente soleado',
    'partly clear': 'Parcialmente despejado',
    'mostly cloudy sky': 'Cielo mayormente nublado',
    'partly cloudy sky': 'Cielo parcialmente nublado',
    'broken clouds': 'Nubes dispersas',
    'overcast sky': 'Cielo cubierto',
    'light rain': 'Lluvia ligera',
    'moderate rain': 'Lluvia moderada',
    'heavy rain': 'Lluvia intensa',
    'light snow': 'Nieve ligera',
    'moderate snow': 'Nieve moderada',
    'heavy snow': 'Nieve intensa',
    'light drizzle': 'Llovizna ligera',
    'moderate drizzle': 'Llovizna moderada',
    'heavy drizzle': 'Llovizna intensa',
    thunderstorms: 'Tormentas',
    'light thunderstorms': 'Tormentas ligeras',
    'moderate thunderstorms': 'Tormentas moderadas',
    'heavy thunderstorms': 'Tormentas intensas',
    'isolated thunderstorms': 'Tormentas aisladas',
    'scattered thunderstorms': 'Tormentas dispersas',

    // Condiciones generadas por el sistema
    despejado: 'Despejado',
    'clima despejado': 'Clima despejado',
    'lluvia fuerte': 'Lluvia Fuerte',
    'lluvia ligera': 'Lluvia Ligera',
    'lluvia moderada': 'Lluvia Moderada',
    nublado: 'Nublado',

    // Variaciones de noche/día
    'clear night': 'Noche despejada',
    'partly cloudy night': 'Noche parcialmente nublada',
    'partly sunny night': 'Noche parcialmente despejada',
    'mostly sunny night': 'Noche mayormente despejada',
    'mostly cloudy night': 'Noche mayormente nublada',
    'cloudy night': 'Noche nublada',

    // Intensidad y condiciones adicionales
    'very light': 'Muy ligera',
    light: 'Ligera',
    moderate: 'Moderada',
    heavy: 'Intensa',
    'very heavy': 'Muy intensa',
    extreme: 'Extrema',

    // Fenómenos especiales
    'freezing rain': 'Lluvia helada',
    'ice pellets': 'Granizo pequeño',
    hail: 'Granizo',
    blizzard: 'Ventisca',
    dust: 'Polvo',
    sand: 'Arena',
    smoke: 'Humo',
    'volcanic ash': 'Ceniza volcánica',

    // Estados temporales
    intermittent: 'Intermitente',
    continuous: 'Continua',
    occasional: 'Ocasional',
    frequent: 'Frecuente',
    isolated: 'Aislada',
    scattered: 'Dispersa',
    widespread: 'Extendida',
  };

  constructor() {}

  /**
   * Traduce una descripción meteorológica del inglés al español
   * @param descripcionIngles - Descripción en inglés
   * @returns Descripción traducida al español
   */
  public traducirDescripcion(descripcionIngles: string): string {
    if (!descripcionIngles) {
      return descripcionIngles;
    }

    // Convertir a minúsculas para buscar en el diccionario
    const descripcionLower = descripcionIngles.toLowerCase().trim();

    // Buscar traducción exacta
    if (this.traducciones[descripcionLower]) {
      return this.traducciones[descripcionLower];
    }

    // Buscar traducciones parciales (palabras clave)
    let descripcionTraducida = descripcionIngles;

    // Ordenar las claves por longitud descendente para evitar traducciones parciales incorrectas
    const clavesOrdenadas = Object.keys(this.traducciones).sort((a, b) => b.length - a.length);

    for (const clave of clavesOrdenadas) {
      if (descripcionLower.includes(clave)) {
        // Reemplazar la palabra/frase manteniendo el caso original
        const regex = new RegExp(clave, 'gi');
        descripcionTraducida = descripcionTraducida.replace(regex, this.traducciones[clave]);
        break; // Solo hacer una traducción para evitar conflictos
      }
    }

    return descripcionTraducida;
  }

  /**
   * Verifica si una descripción está en inglés
   * @param descripcion - Descripción a verificar
   * @returns true si parece estar en inglés
   */
  public esIngles(descripcion: string): boolean {
    if (!descripcion) {
      return false;
    }

    const descripcionLower = descripcion.toLowerCase().trim();

    // Verificar si contiene palabras clave en inglés
    const palabrasIngles = Object.keys(this.traducciones);
    return palabrasIngles.some((palabra) => descripcionLower.includes(palabra));
  }

  /**
   * Agrega nuevas traducciones al diccionario
   * @param nuevasTraducciones - Objeto con pares clave-valor de traducciones
   */
  public agregarTraducciones(nuevasTraducciones: { [key: string]: string }): void {
    Object.assign(this.traducciones, nuevasTraducciones);
  }

  /**
   * Obtiene todas las traducciones disponibles
   * @returns Copia del diccionario de traducciones
   */
  public obtenerTraducciones(): { [key: string]: string } {
    return { ...this.traducciones };
  }
}
