# Candidata unica: continuidad de fenologia e informes

## Alcance y estado

Trabajo local sobre `codex/phenology-report-review-2026-09-13`, descendiente de `52dec253dd7bff0b62e5f991984257ca5e597e97`. No se cambia de base a una copia antigua de Testing. Se conservan los cambios de cartera propia/API de `68e2b978` y de observacion de campo de `52dec253`, ademas de las leyendas compactas del mapa. No promover `1cf874da` aisladamente: la candidata acumulada incluye la restauracion hidrica de `eafa171b`.

No se hizo push, deploy, modificacion de variables, migracion ni reproceso de clientes en esta correccion. Las pruebas locales no acreditan que Testing o Produccion esten alineados ni validan cientificamente coeficientes agronomicos.

## Correcciones de los bloqueos detectados

1. **Cambio de version agrometeorologica.** Las lecturas admiten la generacion activa completa 1.5.0 cuando todavia no existe una 1.5.1 activa. Se declara su version real y la advertencia de serie anterior; no se reetiqueta como recalculada. No se mezclan generaciones, no se leen filas preparatorias y no se rellenan huecos/rangos de la actual con filas antiguas. El endpoint conserva sus resguardos de ciclo corregido, pronostico vencido y kill switch Chaman-Meteo. No encola reprocesos al consultar.
2. **Entradas de huella.** El lector de lluvia/ET0 mantiene la misma seleccion de version compatible. Utiliza solo las metricas meteorologicas historicas y el intervalo solicitado; no toma GDD ni fenologia anterior para modificar Kc. No se alteran formulas ni el manejo preexistente de series incompletas.
3. **Finalizacion falsa de riego.** Solo el POST interno autenticado solicita propagacion de errores. Dependencias rechazadas, fallos de persistencia o invalidacion provocan fallo/reintento, no confirmacion. Un estado agronomico no disponible correctamente guardado sigue siendo un resultado valido. El modo interno espera que terminen todas las escrituras antes de invalidar un fallo parcial, evitando que una respuesta tardia restaure el resultado anterior. Los cron y GET previos conservan el comportamiento por defecto. No se envian integraciones HTTPS desde este circuito.
4. **Reintentos.** El pipeline conserva los pasos ya completados y reintenta riego sin repetir clima, sanidad y agroclima.

## Proteccion contra regresiones ajenas al alcance

`deploy/phenology-continuity-2026-09-13.json` fija una base completa, antecesores requeridos y una lista explicita de archivos de la tarea. `scripts/check-code-continuity.cjs` verifica ascendencia, directorio limpio, cambios fuera de alcance y 19 rutas protegidas existentes. Tambien impide cambios CSS/SCSS aunque aparezcan en la lista permitida. Incluye mapas, permisos, usuarios, licencias, control de integraciones, asesores, indices de establecimientos, suelo y motores hidricos.

```powershell
# Revision local mientras se trabaja; NO constituye candidata sellada.
node scripts/check-code-continuity.cjs deploy/phenology-continuity-2026-09-13.json --working

# Control de candidata versionada y limpia antes de cualquier promocion.
node scripts/check-code-continuity.cjs deploy/phenology-continuity-2026-09-13.json

npm run test:release-safety
node scripts/audit-hydric-compatibility.cjs
```

La comprobacion es local y complementaria. No sustituye CI, comparacion de deployments, prueba funcional, manifiesto, backup o autorizacion. No existe un bypass nuevo del preflight existente. La lista de cambios solo puede ampliarse con una revision explicita; un archivo permitido igualmente necesita revision de su diff y pruebas.

## Resultados locales

- Clima: 26 suites, 286 pruebas.
- Predicciones: 39 suites, 328 pruebas.
- API cliente: 90 suites, 558 pruebas.
- Datos: 76 suites, 602 pruebas.
- Web: 60 pruebas seleccionadas, incluidas 12 de mapas/atribuciones en anchos de escritorio y celular.
- Total anterior: **1.834 pruebas aprobadas**.
- Compatibilidad hidrica: **480 igualdades exactas**, 60 escenarios sinteticos en 10 cultivos; seis archivos operativos identicos a la base anterior.
- Control de continuidad: 14 casos; gates de release existentes: 53 casos.
- Dos reproducciones originales convertidas en regresiones entre servicios: aprobadas con repositorios sinteticos, sin HTTP ni datos de clientes.
- Modelos y los cuatro servicios backend compilan sin diagnosticos TypeScript.
- La web compila en configuracion Testing; mantiene avisos CommonJS heredados. Su CSS generado sigue siendo `styles-GQ5H3PBN.css`, sin cambio de estilos.

Logs y runners locales: `C:/CHAMAN2026/output/phenology-report-audit-2026-09-13/fix-*.log`. Los runners resuelven `modelos` a esta candidata, no a las dependencias antiguas enlazadas en otras carpetas. CI debe repetir pruebas/builds con instalaciones limpias antes de usar sus resultados como evidencia de publicacion.

## Camino pendiente: PC -> Git -> Testing -> Produccion

1. Cerrar un solo commit candidato limpio y comprobar continuidad. Conservarlo como unica linea de trabajo, no crear ramas paralelas por servicio.
2. Releer los deployments/configuracion reales y contrastar cada SHA con la candidata. Los SHA inventariados en la auditoria anterior fueron: Testing API/datos `605bff04`, web `fab67489`; Produccion API `52dec253`, datos/web `68e2b978`; clima `ddd445ed` y predicciones `601f19cf` en ambos. Son evidencia historica, no una consulta live permanente.
3. Antes de Testing, resolver explicitamente la migracion de indices de establecimientos v2 -> v3 que acompana la cartera propia ya vigente en Produccion. Requiere backup y migracion versionada/idempotente de **Testing**. No copiar Mongo Testing a Produccion, no habilitar auto-index/bootstrap/crons como atajo.
4. El generador actual de manifiestos selectivos exige una base de rollback comun. La foto real esta fragmentada: **no inventar un SHA comun ni omitir la evidencia**. La preparacion de promocion debe resolver una foto verificable de rollback por servicio antes de generar un manifiesto valido. Esta correccion local no relaja ese control.
5. Push autorizado de la candidata, CI verde, manifest/rollback y comprobacion de cambios pendientes de Railway. Testing recibe esa misma candidata en los servicios del release; los servicios fuera de alcance permanecen congelados/verificados, especialmente testing-lora.
6. En Testing: registrar brotacion sintetica, comprobar GDD/alertas/refresco y los graficos del informe; comprobar mapas, usuarios/licencias, cartera propia y API. No usar clientes de Produccion para ensayos de escritura.
7. Solo luego de aprobar, Produccion recibe **el mismo commit probado**, nunca una reconstruccion manual o un nuevo commit no validado. La verificacion final debe registrar el SHA efectivo por servicio y la excepcion justificada de cualquier servicio sin cambios. Los cambios de datos reales de Kleppe siguen siendo una operacion separada.

Limites agronomicos heredados de riego y huella perennes: ver `hydric-compatibility-review-2026-09-13.md`. Este bloque no los oculta ni los sustituye por una formula universal.

## Preparacion de Testing: control CI del 13/09

El push de `0a5362e5568c1e6db5df689e7f366683c264dcb5` ejecuto `quality-gates` (run `34768919628`). Quince jobs aprobaron, incluidos todos los backend y ambos Docker; el frontend detecto cuatro fallos entre 531 casos. No se desplego ni se modifico Mongo por ese resultado.

La causa comprobada fue temporal en la prueba `grafico-historico-suelo.component.spec.ts`: las lecturas fijas del 14/08 a las 10:00 quedaron fuera del rango movil de 30 dias al ejecutarse CI el 13/09 a las 16:34 UTC. Se fija el fin de periodo en la preparacion de fixtures (incluidos los DOM); no se cambia el componente, sus estilos, filtros ni datos. Dos regresiones adicionales comprueban que la aplicacion sigue excluyendo datos antiguos/futuros con su reloj real y que un periodo historico explicito no depende del dia de ejecucion. La suite aislada aprueba 49 casos. Se incorpora unicamente ese archivo de pruebas a la lista de cambios permitidos; las 19 rutas protegidas y la prohibicion de CSS/SCSS siguen iguales. La nueva candidata debe repetir CI completo.

Para la diferencia de bases desplegadas, la secuencia prevista es datos -> clima -> predicciones -> api -> web, todos con el mismo SHA candidato. Cada paso requiere un manifiesto selectivo con foto live reciente, SHA/deployment/digest anterior real y verificacion de los demas servicios congelados. Una reversa se ejecuta en orden inverso. No se inventa una base comun ni se relaja el validador de manifiestos. El paso de indices se documenta y verifica separadamente; no se presenta el retiro de v2 como una migracion aditiva.
