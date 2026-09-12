# Polígono del lote: propuesta de contrato, todavía no implementada

Fecha: 12/09/2026. La API ejecutada en Testing sólo admite un punto WGS84 y `superficieHa`. El punto no delimita un lote. Este documento no añade un endpoint operativo ni declara validado el contorno en Chamán.

## Datos que debe enviar el integrador

- ID externo estable del lote y del establecimiento autorizado, nombre del lote y **su contorno real**, preferentemente el mismo utilizado en su plataforma.
- Geometría GeoJSON, WGS84 en grados decimales, coordenadas **[longitud, latitud]**. No confundir con los objetos `{lat,lng}` del contrato puntual actual ni con coordenadas proyectadas UTM/Web Mercator en metros.
- Procedencia y fecha del contorno cuando estén disponibles. La autenticación determina la cartera; el cuerpo no puede elegir un asesor, tenant o propietario arbitrario.
- Superficie declarada opcional, separada del área calculada por Chamán. No reemplazar silenciosamente una por la otra ante discrepancias. Acordar tolerancias tras recibir ejemplos reales del cliente.

Propuesta ilustrativa, **no enviar todavía al endpoint actual**:

```json
{
  "nombre": "Lote demostración",
  "establecimientoIdExterno": "campo-001",
  "geometria": {
    "type": "Polygon",
    "coordinates": [[
      [-63.4000, -32.2000],
      [-63.3900, -32.2000],
      [-63.3900, -32.1900],
      [-63.4000, -32.1900],
      [-63.4000, -32.2000]
    ]]
  }
}
```

Las coordenadas de arriba son ficticias, no límites de un campo autorizado. El primer vértice se repite al final para cerrar el anillo. Un mínimo de tres vértices distintos no garantiza por sí solo una geometría válida.

## Validaciones y comportamiento propuestos

1. Comprobar formato, tipo, cantidad de coordenadas, valores finitos, orden y rangos. Rechazar huecos de datos, dimensiones adicionales no soportadas y geometrías desproporcionadamente grandes; definir límites de tamaño y vértices para evitar consumo abusivo.
2. Comprobar cierre, área positiva y topología, incluidos cruces/autointersecciones. No inventar un cuadrado desde un punto y hectáreas, reordenar vértices al azar, simplificar o reparar un contorno cambiando sus límites sin confirmación.
3. Guardar una geometría canónica y derivar de ella la representación que necesita el mapa, el área geográfica y un punto representativo para los servicios puntuales. Un centroide puede quedar fuera de un polígono cóncavo: validar un punto interior cuando el consumidor lo requiera. No calcular hectáreas en Web Mercator como si sus metros fueran un área geodésica.
4. Conservar la procedencia y distinguir precisión numérica de exactitud del relevamiento. Seis decimales suelen bastar como formato de intercambio; no prometen precisión catastral ni justifican redondear los límites recibidos.
5. Primera entrega recomendada: un `Polygon` simple por lote. El modelo actual de lote usa un único polígono y algunos consumidores toman el primer anillo. Huecos interiores y `MultiPolygon` requieren revisión de todos los mapas, cálculos de área y consumidores satelitales antes de aceptarlos. Mientras tanto rechazarlos explícitamente, nunca descartar partes o rellenar exclusiones.
6. Si sólo se envía un punto, conservar compatibilidad y declarar **sin polígono**. No ofrecer análisis sobre una superficie satelital supuestamente delimitada. El contrato debe distinguir ubicación puntual de límites válidos.
7. El alta con el mismo ID debe ser idempotente. Un contorno diferente no puede sobrescribir el lote mediante el PUT de alta actual. Una futura operación explícita de edición necesitará control de revisión, historial, autorización y recálculo controlado.
8. Para KML/KMZ o Shapefile: el integrador puede convertirlos a GeoJSON, o acordar una importación validada. La web ya tiene importadores, pero eso no significa que el endpoint público acepte esos archivos. Evitar descargar geometrías desde URLs arbitrarias aportadas por clientes.

## Prueba de aceptación obligatoria

Enviar por API un polígono de prueba autorizado. Ingresar en Chamán con appcorteva y comparar nombre, cartera, establecimiento, todos los vértices/contorno, ubicación, área y encuadre del mapa. Repetir para cartera propia y para productor asesorado; probar duplicados, geometría inválida y rechazo de acceso cruzado. Luego crear la siembra y comprobar etapa/fecha/origen en web y API. No considerar probado el mapa por una respuesta 201 ni considerar validada la fenología por aceptar el polígono.

Antes de fijar el contrato definitivo, pedir al cliente uno o dos ejemplos anonimizados de su geometría (incluido un caso irregular), formato y sistema de coordenadas de origen, y si usan huecos o partes separadas.

## Referencias primarias

- [RFC 7946, GeoJSON](https://www.rfc-editor.org/rfc/rfc7946.html): WGS84, orden de ejes, anillos, orientación y tipos Polygon/MultiPolygon.
- [PostGIS ST_IsValid](https://postgis.net/docs/ST_IsValid.html): validez geométrica 2D y detección de autointersecciones. Referencia de validación, no decisión de migrar Chamán a PostGIS.

Las reglas de negocio, límites técnicos y secuencia de validación anteriores son una propuesta para Chamán, no exigencias completas del estándar GeoJSON.
