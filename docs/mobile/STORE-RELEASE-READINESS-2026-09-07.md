# Chamán 1.6.0 — preparación de publicación

Fecha de comprobación: 7 de septiembre de 2026. Este documento no autoriza publicación.

## Resultado

El problema reportado no fue una redirección incorrecta de TestFlight: el titular
había instalado la publicación histórica 1.5.5 desde App Store. Reinstaló 1.6.0
desde TestFlight y confirmó que funciona. No se modificó login, DNS ni servidores.

La versión nueva requiere completar su preparación editorial y técnica antes de
enviarla a Apple. No hay un envío en revisión al momento de esta comprobación.

## Hecho en App Store Connect

- Se creó 1.6.0 **En preparación para el envío** en la app existente 6744028690.
- Se mantiene `com.chamanagro.app`: no se creó otra app ni se cambió su identidad.
- Se guardaron descripción, novedades y palabras clave actualizadas.
- Se reemplazó el contacto de revisión por Leonardo Espinoza, con el correo y
  teléfono indicados expresamente por el titular (guardados en Apple, no en Git).
- Publicación manual seleccionada. No se pulsó Añadir a revisión ni Enviar.
- No se eligió aún una compilación: la 3 precede a varias correcciones productivas.
- Las capturas heredadas de 2025 todavía no se reemplazaron.

## Candidato técnico local, compilación 4

- Rama aislada: `codex/ios-store-candidate-2026-09-07`.
- Base de interfaz productiva: `b9593a1d9599fc8c6959d1c70603366a7f422cf4`.
- Empaquetado y dependencias nativas: portados de la compilación 3 probada,
  `4270349b41afeedbd1dfebb2485b24748605a432`.
- Versión 1.6.0, build iOS 4, Apple team 38589U58A3; bundle ID sin cambios.
- Conserva correcciones de sanidad, privacidad de fórmulas, malezas, asesores y
  licencias que ya están en la web. No mezcla el rediseño no aprobado.
- `server.url` ausente: interfaz incluida en el binario, sin redirección a una web antigua.
- Endpoints nativos iguales a los de Producción. COOKIE_AUTH continúa false.
- La tarjeta de respuesta hídrica tiene por defecto nativo el mismo estado activo
  que la web productiva. Un valor explícito false sigue siendo respetado.
- Se conserva la declaración de cifrado exento autorizada previamente y se incorpora
  como `ITSAppUsesNonExemptEncryption=false` para la próxima compilación.
- Los archivos Android portados sólo mantienen coherencia con Capacitor 8 ya probado;
  no se compiló, firmó ni publicó una versión Android en este trabajo.

## Validación local

- Build modelos: correcto.
- Build Angular Production: correcto, con avisos CommonJS preexistentes.
- Suite Angular: **479/479** correctas. El primer arranque de Chrome falló por
  restricciones del entorno; la repetición autorizada completó toda la suite.
- Configuración móvil: correcta; **8/8** pruebas de endpoints, flags y empaquetado.
- Auditoría de secretos del árbol: sin secretos obvios detectados.
- 199 archivos HTML/SCSS/CSS iguales a la base productiva.
- CSS compilado `styles-FOW7C6W4.css` idéntico byte a byte al servido en Producción.
  SHA-256: `7038fb7939a884a55c31309ebe34c23b5b52889cad5b260b9d90bb4e6eb71e46`.
- `cap sync ios`: copia y sincronización correctas. Windows no tiene CocoaPods/Xcode;
  esto **no equivale** a un archive firmado ni valida ejecución en un iPhone.
- No se hizo push ni merge; no se ejecutó un workflow de firma o subida.

## Pendientes antes de enviar

1. Aprobar el SHA final, subir a GitHub en la rama aislada y usar la firma existente
   para generar 1.6.0 (4) en macOS. Nunca usar una rama conectada a Railway.
2. Verificar su procesamiento y funcionamiento en TestFlight. El titular probó la 3,
   todavía no la 4. No declarar la 4 validada físicamente antes de esa prueba.
3. Reemplazar capturas por imágenes reales de la compilación final y datos de demo
   o datos propios autorizados para uso público. No usar datos privados de clientes.
4. Cuenta de revisión: comprobar o reemplazar `store-verification-user`, que se heredó
   de la ficha antigua. No se leyó su contraseña ni se intentó login. Crear o modificar
   una cuenta productiva requiere alcance explícito y aislamiento de clientes.
5. Actualizar política pública y declaración App Privacy según el documento técnico
   de privacidad adjunto. No declarar anonimato donde hay asociación a la cuenta.
6. Completar clasificación de edades con las funcionalidades reales. No es una red
   social pública; el asistente inspeccionado responde localmente y no constituye
   chat entre personas. Confirmar cualquier funcionalidad comercial no visible en el código.
7. Confirmar derechos del contenido de terceros (mapas, imágenes y fuentes) antes de
   sustituir la respuesta heredada que dice que no hay contenido de terceros.
8. Decidir situación DSA para la UE. Apple muestra pendiente la declaración de
   comerciante; no se cambió la disponibilidad geográfica ni se hizo esa declaración.

## Cuenta y disponibilidad

El acuerdo de apps gratuitas figura Activo del 3/9/2026 al 3/9/2027.
El acuerdo de apps de pago es Nuevo; no se aceptó ni se alteraron cobros/precios.
El aviso DSA corresponde a distribución en la Unión Europea y no demuestra un
bloqueo general de publicación en Argentina. No se garantiza aprobación ni plazo.

## Capturas: criterio de aceptación

Conservar soporte iPhone e iPad (`TARGETED_DEVICE_FAMILY=1,2`). Para el grupo grande
de iPhone usar una captura nativa admitida, por ejemplo 1290×2796 o 1320×2868.
Para iPad, 2064×2752 o 2048×2732. Una captura de iPhone 15 Pro (1179×2556) sirve para
su grupo pero no reemplaza por sí sola la captura principal de pantalla grande.
No estirar una captura de otro dispositivo ni simular funciones inexistentes.

Orden propuesto: mapa/resumen, detalle de lote, clima/suelo, monitoreo, informe.
De una a diez imágenes por grupo, PNG/JPEG sin transparencia, con interfaz real.

## Fuentes primarias

- [Envío a revisión](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app)
- [Privacidad](https://developer.apple.com/app-store/app-privacy-details/)
- [Clasificación por edades](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/)
- [Capturas admitidas](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
- [Eliminación de cuentas](https://developer.apple.com/support/offering-account-deletion-in-your-app/)

Las declaraciones de privacidad y comercio requieren comprobación por el titular;
este informe técnico no sustituye una revisión legal ni confirma hechos no observados.
