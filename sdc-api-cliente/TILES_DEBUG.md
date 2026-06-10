# Tiles Climáticos - Endpoint de Debug

## Descripción

Este endpoint permite calcular qué tiles de Meteosource se necesitarían para cubrir los establecimientos de un usuario autenticado. Es útil para debuggear y visualizar el área que se cubrirá antes de implementar la descarga real de tiles.

## Endpoint

```
GET /clima/tiles/debug/:variable/:datetime?zoom=8
```

### Parámetros

- **variable** (path): Variable climática a obtener
  - Valores permitidos: `temperature`, `precipitation`, `clouds`, `wind_speed`, `humidity`, `pressure`
  - Ejemplo: `temperature`

- **datetime** (path): Momento temporal
  - Formato: `now`, `+Xhours`, `+Xdays`, o `YYYY-MM-DDTHH:MM`
  - Ejemplos: `now`, `+1hours`, `+6hours`, `2025-01-20T15:00`

- **zoom** (query, opcional): Nivel de zoom para los tiles
  - Rango: 1-18
  - Por defecto: 8

## Autenticación

Requiere token Bearer válido del usuario. El endpoint calculará los tiles para los establecimientos del usuario autenticado.

## Respuesta de Ejemplo

```json
{
  "message": "Debug tiles calculado exitosamente",
  "variable": "temperature",
  "datetime": "now",
  "zoom": 8,
  "establecimientos": 3,
  "bounds": {
    "minLat": -34.6037,
    "maxLat": -34.5037,
    "minLng": -58.4516,
    "maxLng": -58.3516
  },
  "tiles": [
    { "x": 77, "y": 167, "z": 8 },
    { "x": 78, "y": 167, "z": 8 },
    { "x": 77, "y": 168, "z": 8 },
    { "x": 78, "y": 168, "z": 8 }
  ],
  "totalTiles": 4,
  "establecimientosData": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "nombre": "Campo Norte",
      "ubicacionCount": 2
    },
    {
      "_id": "507f1f77bcf86cd799439012", 
      "nombre": "Campo Sur",
      "ubicacionCount": 1
    }
  ]
}
```

## Casos de Respuesta

### Usuario sin establecimientos
```json
{
  "message": "Usuario sin establecimientos",
  "variable": "temperature",
  "datetime": "now", 
  "zoom": 8,
  "establecimientos": 0,
  "tiles": [],
  "totalTiles": 0
}
```

### Establecimientos sin coordenadas válidas
```json
{
  "message": "No se pudieron calcular bounds de establecimientos",
  "variable": "temperature",
  "datetime": "now",
  "zoom": 8, 
  "establecimientos": 2,
  "tiles": [],
  "totalTiles": 0
}
```

## Algoritmo de Cálculo

1. **Obtiene establecimientos** del usuario autenticado
2. **Extrae coordenadas** de los polígonos GeoJSON de cada establecimiento
3. **Calcula bounding box** que contiene todos los establecimientos
4. **Aplica padding generoso** para incluir área circundante
5. **Convierte a tiles** usando la proyección Web Mercator (Google Maps)
6. **Devuelve lista de tiles** que se necesitarían descargar

## Prueba Local

### Script Básico
```bash
# Editar credenciales en el script
nano test-tiles-debug.sh

# Ejecutar el script básico
./test-tiles-debug.sh
```

### Script Avanzado (Recomendado)
```bash
# Usando variables de entorno
export USERNAME="tu-email@ejemplo.com"
export PASSWORD=""
export BASE_URL="http://localhost:3001"

# Probar con valores por defecto (temperature, now, zoom 8)
./test-tiles-advanced.sh

# Probar diferentes parámetros
./test-tiles-advanced.sh precipitation +2hours 10
./test-tiles-advanced.sh wind_speed now 12
./test-tiles-advanced.sh temperature +1days 8

# Ver ayuda
./test-tiles-advanced.sh --help
```

### Curl Manual
```bash
# 1. Obtener token
TOKEN=$(curl -s -X POST "http://localhost:3001/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"tu-email@ejemplo.com","password":""}' \
  | jq -r '.accessToken')

# 2. Probar endpoint
curl -X GET \
  "http://localhost:3001/clima/tiles/debug/temperature/now?zoom=8" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  | jq '.'
```

## Próximos Pasos

1. **Verificar que los tiles calculados son correctos** usando este endpoint
2. **Implementar descarga real** de tiles desde sdc-api-clima
3. **Agregar cache Redis** para tiles descargados
4. **Implementar visualización** en el frontend Angular
5. **Optimizar área de cobertura** basado en feedback real

## Notas Técnicas

- Usa proyección **Web Mercator** compatible con Google Maps/OpenLayers
- El **padding dinámico** se ajusta según el nivel de zoom
- Los **tiles se calculan** usando el estándar XYZ de mapas de tiles
- **Radio generoso** para asegurar cobertura completa del área de interés
