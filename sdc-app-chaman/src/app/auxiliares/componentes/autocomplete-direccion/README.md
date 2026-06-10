# Componente AutoComplete Dirección

Un componente Angular que combina un autocompletado de direcciones con un mapa interactivo usando PrimeNG y OpenLayers.

## Características

- **Autocompletado de direcciones**: Busca y sugiere direcciones usando el servicio GeoNode
- **Búsqueda mejorada por ubicación**: Usa la ubicación del dispositivo para búsquedas más precisas
- **Geolocalización inteligente**: Capacitor.js para apps nativas, fallback al navegador para PWA/web
- **Mapa interactivo**: Muestra un mapa con OpenLayers donde se puede arrastrar el marcador
- **Marcador arrastrable**: Coloca un pin en el mapa que se puede mover arrastrándolo
- **Geocodificación bidireccional**:
  - Forward geocoding: convierte direcciones en coordenadas
  - Reverse geocoding: convierte coordenadas en direcciones
- **Emisión de eventos**: Emite un objeto con la dirección completa y el GeoJSON
- **Centro dinámico**: El mapa se centra automáticamente en la ubicación del dispositivo

## Uso

### Importación

El componente ya está importado en el `SharedModule`, por lo que está disponible en toda la aplicación.

### Template

```html
<app-autocomplete-direccion
  [placeholder]="'Buscar dirección...' | translate"
  [disabled]="loading"
  [useDeviceLocation]="true"
  [initialValue]="direccionSeleccionada"
  (direccionChange)="onDireccionChange($event)"
></app-autocomplete-direccion>
```

### Component TypeScript

```typescript
import { DireccionSeleccionada } from './path/to/autocomplete-direccion.component';

export class MyComponent {
  public direccionSeleccionada?: DireccionSeleccionada;
  public loading = false;

  public onDireccionChange(direccion: DireccionSeleccionada): void {
    console.log('Dirección seleccionada:', direccion);
    // direccion.direccion contiene la dirección como string
    // direccion.geojson contiene las coordenadas en formato GeoJSON Point
  }
}
```

## Propiedades de Entrada (@Input)

| Propiedad           | Tipo                    | Default                 | Descripción                                                               |
| ------------------- | ----------------------- | ----------------------- | ------------------------------------------------------------------------- |
| `placeholder`       | `string`                | `'Buscar dirección...'` | Texto placeholder para el input                                           |
| `disabled`          | `boolean`               | `false`                 | Deshabilita el componente                                                 |
| `useDeviceLocation` | `boolean`               | `true`                  | Usa la ubicación del dispositivo para mejorar búsquedas y centrar el mapa |
| `initialValue`      | `DireccionSeleccionada` | `undefined`             | Valor inicial para mostrar                                                |

## Eventos de Salida (@Output)

| Evento            | Tipo                    | Descripción                                      |
| ----------------- | ----------------------- | ------------------------------------------------ |
| `direccionChange` | `DireccionSeleccionada` | Se emite cuando cambia la dirección seleccionada |

## Interfaz DireccionSeleccionada

```typescript
export interface DireccionSeleccionada {
  direccion: string; // Dirección completa como string
  geojson: IGeoJSONPoint; // Coordenadas en formato GeoJSON Point
}
```

### Estructura del GeoJSON Point

```typescript
{
  type: 'Point',
  coordinates: [longitude, latitude]  // [lng, lat] en formato WGS84
}
```

## Funcionalidades

### 1. Autocompletado

- Escribe en el input para buscar direcciones
- Mínimo 3 caracteres para activar la búsqueda
- **Búsqueda mejorada**: Usa la ubicación del dispositivo para resultados más relevantes
- Selecciona una dirección de la lista para ubicarla en el mapa
- Solo muestra texto de direcciones (sin coordenadas)

### 2. Interacción con el mapa

- **Arrastra el marcador** para seleccionar una nueva ubicación
- Se hace reverse geocoding automáticamente para obtener la dirección
- El marcador se puede mover arrastrándolo con el mouse
- Cursor cambia a "grab" cuando está sobre el marcador

### 3. Marcador personalizado

- Ícono de pin rojo personalizado
- Se centra automáticamente en la ubicación seleccionada
- **Arrastrable**: puedes mover el marcador para cambiar la ubicación
- Animación suave al cambiar de posición programáticamente

## Servicios Utilizados

### GeoNodeService

- `direcciones(text: string)`: Busca direcciones que coincidan con el texto
- `geocode(text: string)`: Convierte una dirección en coordenadas
- `reverse(geojson: IGeoJSONPoint)`: Convierte coordenadas en dirección (usa la propiedad `direccion` de DireccionV2)

### OpenLayersService

- Proporciona las capas base del mapa
- Utilidades para manejo de coordenadas

## Estilos

El componente incluye estilos CSS responsivos:

- Altura del mapa adaptable (400px en desktop, 250px en móvil)
- Z-index apropiado para el dropdown del autocompletado
- Overlay de carga con blur effect
- Cursor personalizado para el mapa

## Ejemplo Completo

```typescript
// component.ts
export class MyFormComponent {
  public direccionDistribuidor?: DireccionSeleccionada;

  public onDireccionDistribuidorChange(direccion: DireccionSeleccionada): void {
    this.direccionDistribuidor = direccion;

    // Guardar en formulario o enviar a API
    this.form.patchValue({
      direccion: direccion.direccion,
      latitud: direccion.geojson.coordinates[1],
      longitud: direccion.geojson.coordinates[0],
    });
  }
}
```

```html
<!-- component.html -->
<div class="field">
  <label>Ubicación del Distribuidor</label>
  <app-autocomplete-direccion
    placeholder="Buscar dirección del distribuidor..."
    [disabled]="loading"
    [useDeviceLocation]="true"
    [initialValue]="direccionDistribuidor"
    (direccionChange)="onDireccionDistribuidorChange($event)"
  ></app-autocomplete-direccion>
</div>
```

## Dependencias

- PrimeNG (AutoComplete, ProgressSpinner, FloatLabel)
- OpenLayers (Map, View, Layers)
- **Capacitor** (@capacitor/core, @capacitor/geolocation)
- Angular Forms (NgModel)
- Modelos personalizados (IGeoJSONPoint, ICoordenadas)

## Notas Técnicas

1. El mapa se inicializa en `ngAfterViewInit` para asegurar que el DOM esté listo
2. Las coordenadas se manejan en formato [longitude, latitude] (estándar GeoJSON)
3. El componente es completamente reactivo y maneja estados de carga
4. Se incluye manejo de errores para servicios de geocodificación
5. El componente es reutilizable y no tiene dependencias de formularios específicos
6. **Interacción por arrastre**: El marcador solo se mueve arrastrándolo, no por click en el mapa
7. **Direcciones optimizadas**: Usa la propiedad `direccion` de DireccionV2 directamente cuando está disponible
8. **UI limpia**: Solo muestra texto de direcciones en el autocomplete, sin coordenadas
9. **Geolocalización híbrida**:
   - **Apps nativas**: Usa Capacitor Geolocation para mejor precisión y permisos nativos
   - **PWA/Web**: Fallback automático a navigator.geolocation del navegador
   - **Offline/Error**: Usa coordenadas por defecto de Argentina
10. **Búsquedas contextuales**: Las búsquedas incluyen la ubicación del usuario para resultados más relevantes
11. **Centro inteligente**: El mapa se centra automáticamente en la ubicación del dispositivo cuando está disponible
