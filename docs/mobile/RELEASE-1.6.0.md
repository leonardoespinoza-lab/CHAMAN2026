# Chamán móvil 1.6.0 — preparación de tiendas

Estado: candidato local. No fue subido, firmado, desplegado ni enviado a
revisión.

## Identidad que no debe cambiar

| Dato | Valor |
| --- | --- |
| Nombre | Chamán |
| Bundle/package ID | `com.chamanagro.app` |
| Apple App Store ID | `6744028690` |
| Apple team ID | `38589U58A3` |
| Versión | `1.6.0` |
| Android versionCode | `22` |
| iOS build | `3` |

Cambiar el bundle/package ID crearía otra aplicación y dejaría fuera a quienes
ya tienen Chamán instalada.

## Estado técnico validado

- Rama aislada: `codex/mobile-release-2026-09-03`.
- Base exacta: release productivo `prod-2026.09.03.3`.
- Frontend: 454 pruebas exitosas.
- Build Angular de producción: exitoso.
- Capacitor Android e iOS: sincronización exitosa.
- Auditoría de secretos: sin secretos obvios en el árbol actual.
- Validación móvil: versiones, permisos, endpoints y firma coherentes.
- CI preparada para Android API 36 e iOS/Xcode 26.

## Barreras antes de un build funcional

La web móvil nativa usa estos orígenes:

- Android: `https://localhost`
- iOS: `capacitor://localhost`

Antes de TestFlight o una prueba Android contra producción deben agregarse de
forma aditiva a la lista CORS de la API y del WebSocket. Esa modificación no
forma parte de este candidato y requiere autorización separada porque reinicia
los servicios. No se deben borrar ni reemplazar los orígenes web actuales.

La firma Android quedó parametrizada y sin contraseña en el código. La llave
histórica debe considerarse sensible; la opción profesional es Play App Signing
y una llave de carga administrada por la cuenta corporativa.

## Apple App Store Connect

La aplicación existente `Chamán` está publicada como 1.5.5. Para 1.6.0:

1. Crear una nueva versión de iOS, sin crear otra app.
2. Subir el build firmado generado desde el mismo commit aprobado.
3. Actualizar las respuestas nuevas de clasificación por edades.
4. Cambiar el contacto de revisión heredado de Ezequiel Falcón por el contacto
   vigente de Chamán Agro SA.
5. Confirmar que `store-verification-user` continúe activo y tenga datos de
   demostración seguros.
6. Actualizar privacidad para declarar fotos, audios, notas de campo,
   ubicación e identificador de usuario según su uso real.
7. Seleccionar publicación manual para conservar el control del momento de
   salida.

La auditoría de acceso del 3 de septiembre de 2026 encontró que Ezequiel Falcón
conserva los roles Gestor de apps y Atención al cliente sobre todas las apps.
La revocación debe hacerse con autorización explícita del titular. También está
pendiente solicitar acceso a la API de App Store Connect; ese acceso es
necesario si la firma y carga se automatizan desde GitHub.

No se enviará a revisión hasta completar una prueba interna de TestFlight.

## Google Play

La cuenta corporativa existe, pero la consola exige completar identidad,
verificación del dominio y teléfono antes de crear/importar la ficha. Al quedar
habilitada, se debe conservar el package ID `com.chamanagro.app` y verificar si
la app histórica puede transferirse. No se debe publicar otra app con un ID
distinto.

## Texto propuesto para las tiendas

### Subtítulo

`Gestión agronómica del lote`

### Texto promocional

`Seguimiento agronómico, clima, sensores, imágenes satelitales y registros de campo para tomar decisiones sobre cada lote desde un solo lugar.`

### Descripción

Chamán reúne la información agronómica de tus establecimientos y lotes en una
experiencia simple para web y dispositivos móviles.

Consultá el cultivo y su etapa fenológica, variables meteorológicas, sensores
de campo, humedad del suelo y napa, índices satelitales y evolución térmica.
Revisá indicadores de enfermedades, malezas, riego y respuesta hídrica de
acuerdo con los datos disponibles para cada lote.

Registrá visitas, comentarios, fotos y audios; documentá fertilizaciones y
fumigaciones con uno o más productos; y generá informes agronómicos que integran
la trazabilidad del ciclo.

La disponibilidad de funciones y datos depende de los servicios contratados,
la cobertura meteorológica y los dispositivos asociados a cada establecimiento.
Los indicadores de Chamán apoyan el seguimiento y deben complementarse con la
observación y el criterio profesional a campo.

### Novedades de 1.6.0

`Actualizamos el seguimiento de lotes con mejoras en clima histórico, sensores, sanidad, respuesta hídrica, imágenes satelitales e informes. También incorporamos registros de fotos y audios y aplicaciones con múltiples productos.`

### Palabras clave Apple

`agricultura,agronomía,cultivos,lotes,clima,riego,sensores,NDVI,enfermedades,siembra`

## Criterio de aprobación

- Los jobs Android e iOS de GitHub deben finalizar en verde.
- Login, permisos, mapa, lotes, fotos, audio y cierre/reapertura deben probarse
  en un teléfono real de cada plataforma.
- API y WebSocket deben aceptar sólo los orígenes nativos agregados y los
  orígenes web preexistentes.
- No debe existir ningún cambio en Railway, MongoDB, Redis, ChirpStack ni
  decodificadores LoRaWAN como efecto de compilar la app.
- El SHA firmado debe coincidir con el SHA aprobado en GitHub.
