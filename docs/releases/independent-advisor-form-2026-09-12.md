# Alta de asesor independiente: corrección del formulario

Fecha: 2026-09-12. Estado: preparado localmente; pendiente de autorización de push y despliegue.

## Causa y alcance

El formulario de usuarios imponía `Validators.required` a `idQuimica` para
Asesor cuando el actor no era Compañía ni Tenant. También seleccionaba la única
compañía del listado al refrescar los validadores. Con el catálogo vacío, el
Admin no podía guardar un asesor independiente.

El servidor productivo ya admite un Asesor sin compañía, distribuidor ni cartera
inicial. Se verificaron el servicio de usuarios, sus pruebas de autorización y
el esquema de persistencia. No hace falta modificar el backend ni migrar Mongo.

La corrección únicamente cambia el formulario y sus pruebas:

- Compañía opcional para el alta de un asesor independiente desde Admin.
- Sin selección automática por cantidad de compañías disponibles.
- Permite limpiar la selección y conserva una vinculación existente o elegida.
- Desde Compañía se mantiene la vinculación derivada de la sesión; desde Tenant
  se mantiene la organización y sus restricciones.
- El nivel Compañía sigue requiriendo su identificador. No se alteran otros niveles.
- Etiqueta y ayuda explican la opción independiente; no cambian estilos ni layout.

No tener compañía no concede acceso global: siguen vigentes los controles del
servidor sobre cartera propia y establecimientos asignados. Las relaciones de
establecimientos existentes siguen siendo normalizadas por el servidor; esta
corrección no desvincula redes existentes ni reasigna clientes.

## Separación de versiones

Se prepara una candidata sobre cada web desplegada, sin incluir la API de
integraciones pendiente ni revertir diferencias anteriores ajenas a este arreglo:

- Producción: base `b0b025b98b795631f0ae54219c91231ce91c9605`, rama
  `codex/fix-independent-advisor-2026-09-12`.
- Testing: base `233b50be31086ab892defefbf2ae447eb8b4eee7`, rama
  `codex/fix-independent-advisor-testing-2026-09-12`; aplicar únicamente el mismo
  parche del formulario y sus pruebas.

No se despliegan API, datos, auth, clima, predicciones, móviles ni otros servicios.
No se modifican licencias, contraseñas, registros existentes ni variables funcionales.

## Validación local

- Reproducción previa: cinco pruebas nuevas detectaron el bloqueo, la selección
  automática y la ausencia de etiqueta opcional.
- Web completa con Karma/ChromeHeadlessCI: **499 pruebas correctas**, incluidas
  las 11 del formulario. Guardado simulado sin llamadas a Producción; prueba del
  botón real de limpiar selección.
- Servidor sin cambios: **31 pruebas correctas** de asesor, compañía, tenant y
  alcance de permisos (cinco suites).
- Compilación web de Producción correcta; avisos CommonJS de dependencias existentes.
- Auditorías de secretos, logs sensibles y configuración productiva de la web correctas.
- Diferencia respecto de Producción sin archivos backend, modelos, estilos ni dependencias.

La prueba completa de Karma debe ejecutarse después del build, no simultáneamente:
ambos usan `dist` y el build limpia ese directorio. Se repitió secuencialmente tras
detectar esa interferencia local, con 499 resultados correctos.

## Promoción y reversión propuestas

1. Confirmar los SHA finales de ambas ramas, push y controles de GitHub.
2. Desplegar sólo `testing-web`, verificar formulario sin compañía y conservar los
   créditos compactos del mapa ya desplegados en Testing.
3. Promover sólo `CHAMAN2026` (web de Producción); comprobar SHA, salud, API de
   Producción y ausencia de cambios en otros servicios/configuraciones.
4. El usuario completa el alta real de `appcorteva` desde su sesión Admin, sin
   compañía ni cartera inicial; luego continuar el aprovisionamiento independiente
   de la API. No enviar altas de prueba en cuentas reales.
5. Si falla la web, restaurar exclusivamente su despliegue/base anterior. No hay
   migración que revertir. Las altas reales que el usuario haya completado no se borran.

Antes de promover se debe tomar una instantánea actualizada de despliegues y
hashes de configuración. La consulta de esta preparación encontró ambos entornos
sin cambios pendientes en Railway.
