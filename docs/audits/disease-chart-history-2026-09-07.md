# Corrección visual del historial sanitario — 7 de septiembre de 2026

## Alcance

Solo frontend. Sin modificaciones de cálculos, API, permisos, registros meteorológicos o predicciones persistidas. Objetivo autorizado: probar la corrección en `testing-web`; Producción no se despliega.

Base: SHA productivo confirmado `9529dcc7db5477d2e9d2c7ad0069e5725da5378b`. El `main` remoto (`4bf3af3`) no contiene las mejoras que ya funcionan en Producción. Por ello el candidato conserva la base operativa y no fusiona ni sobrescribe `main`. Testing web partía de `ab8ba49`.

## Contrato visual

- Gráfico nativo Highcharts de líneas sólidas, sin suavizado ni transformación numérica; escala 0–100.
- Una fila por enfermedad en el tooltip, con nombre, un decimal, unidad y estado cuando no hay un valor calculado.
- Los índices se muestran `/100`; el contrato horario de roya amarilla de trigo conserva `% horas favorables`. Ninguno se presenta como porcentaje de plantas enfermas.
- Cebada, soja y maíz agrupan por enfermedad y versión. Las versiones no se conectan. Los días omitidos, valores inválidos y estados no calculables interrumpen la curva; cero calculado sigue siendo cero.
- Se conserva la política vigente de trigo (última versión por enfermedad). No se reintroducen sus modelos antiguos en el gráfico.
- Cebada conserva un color por enfermedad; el nombre distingue versiones. Se retiran sus bandas comunes de riesgo: la misma escala numérica no hace equivalentes los índices diarios, de ventana y legados.
- Las enfermedades sin valores trazables mantienen su nombre y muestran un estado textual. No se fabrican ceros.
- Tooltip acotado para móvil, sin fórmulas ni variables internas. Nombres y textos escapados antes de insertarlos en HTML.
- Se mantiene el contenedor y el sistema visual de Chaman; no se aplica el rediseño general propuesto anteriormente.

## Verificación

- Regresión de la captura: 03/08 v3 99,86 y 04/08 v4 41,09 permanecen intactos y en series separadas.
- Comprobación local del adaptador contra la extracción de Producción: 129 días, 516 lecturas; sin mutación de la entrada. Mancha en Red: 85 puntos calculados v3 y 34 v4. Fusariosis: cero puntos trazados, no una curva de valor cero.
- Pruebas del gráfico: 24 aprobadas, incluidas renderización Highcharts y tooltip a 360 y 1280 px.
- Compilaciones Testing y producción local aprobadas (sin desplegar Producción).
- Auditorías locales de topología, secretos y logs aprobadas; siete pruebas responsive existentes aprobadas.
- La batería completa detectó una aserción obsoleta del listado de lotes. Se comprobó que ya estaba en la base productiva; se actualiza únicamente la prueba para reflejar al asesor Admin/Escritura autorizado, añadiendo el caso Lectura sin gestión. Ningún código de autorización fue alterado.
- Resultado final de la batería completa: **471 pruebas aprobadas** en Chrome Headless CI.

La validación de representación no certifica la calibración agronómica del modelo. No se recalculan históricos para disimular discontinuidades. Una reconstrucción histórica homogénea sigue siendo una tarea separada.

## Simplificación solicitada después de la prueba local (sin desplegar)

El usuario pidió quitar las versiones, los avisos de calidad sobre las curvas y las enfermedades que no aportan valores a la imagen. Este ajuste posterior a `2456283` sigue local:

- Tabla flotante: fecha, nombre y valor con un decimal, sin `v3/v4`, `Datos a revisar`, `Sin datos` ni `Fuera de ventana`.
- Una entrada de leyenda por enfermedad; todas sus versiones se ocultan/muestran juntas. Se conserva el color original y la separación interna de los tramos.
- Se omiten de la visualización las enfermedades sin ningún valor positivo en el historial mostrado. En las curvas retenidas se conservan los ceros calculados (incluidos los retornos a cero), los huecos y los valores originales. No se elimina ni modifica ningún registro.
- Se retiran textos explicativos largos, el contador de lecturas y la lista de series vacías. Una vista sin series muestra únicamente `Sin valores para graficar`, sin afirmar ausencia de enfermedad.
- Se conserva `/100` para los índices y la unidad horaria de trigo cuando corresponde. No se renombra un índice ambiental como porcentaje observado de enfermedad.
- No se modifica el detalle agronómico, el motor, las alertas, los permisos ni las tarjetas actuales bajo el gráfico. No se toca CSS global, paleta ni el rediseño pendiente.
- La reproducción local usa los componentes reales y mantiene los controles auxiliares únicamente bajo `?qa=1`; la URL normal muestra solo el gráfico.
- 27 pruebas del módulo aprobadas; comprobación visual e interacción a 1440, 390 y 360 px en cuatro fechas y control de leyenda. Evidencia local: `C:/CHAMAN2026/output/disease-chart-audit-2026-09-07/simplified-checks.json`.

## Aclaración: mantener las enfermedades monitoreadas debajo (sin desplegar)

La simplificación corresponde al gráfico y su tooltip, no al catálogo de enfermedades monitoreadas. Las tarjetas inferiores nunca se eliminaron del componente de Chaman; faltaban en la reproducción local porque montaba únicamente el gráfico aislado.

- La reproducción normal ahora monta `CardEnfermedadesComponent` completo, conservando el estilo nativo. En cebada aparecen las cuatro tarjetas: Mancha en Red, Escaldadura, Roya de la Hoja y Fusariosis de la Espiga, aunque las dos últimas no tengan curva en el caso mostrado.
- Se conservan los valores originales y los estados de las tarjetas; no se convierten las lecturas ausentes o fuera de ventana en ceros. El detalle de cada enfermedad continúa disponible.
- Se agrega una regresión del componente padre que mantiene las cuatro tarjetas con resultados positivos, cero calculado, lectura ausente y fuera de ventana. No se modifica el TS, HTML ni SCSS operativo de ese componente.
- La reproducción usa solo registros anonimizados en memoria; bloquea el botón de recálculo local, no utiliza autenticación ni solicita API reales. La calidad y validación conservan los estados del registro de origen, sin incorporar fórmulas o variables internas.
- 39 pruebas focalizadas aprobadas. Verificación visual y funcional a 1440, 390 y 360 px: cuatro tarjetas debajo del gráfico, apertura/cierre de sus cuatro detalles, cuatro fechas en el tooltip y alternancia de leyenda; sin errores de página ni respuestas externas. Evidencia: `C:/CHAMAN2026/output/disease-chart-audit-2026-09-07/monitored-cards-checks.json`.
- Cambios locales únicamente; sin push, despliegue ni modificación de Producción o Testing.

## Aclaración final: leyenda completa de colores y nombres

El usuario precisó que se refería a la **leyenda del gráfico** (rayita de color y nombre), no a las tarjetas. Esta indicación reemplaza la decisión previa de quitar las enfermedades sin curva también de la leyenda.

- Se conserva una entrada por enfermedad disponible en las series del monitoreo, con su color original y símbolo sólido. Las versiones continúan agrupadas bajo el mismo nombre.
- Para una enfermedad sin valores positivos en la ventana mostrada se usa una serie de presentación vacía, solo para su leyenda; no se inventan puntos, ceros ni filas en el tooltip. Los datos originales permanecen intactos.
- La leyenda del caso de cebada vuelve a mostrar las cuatro enfermedades; trigo conserva sus cinco nombres canónicos aun si solo uno tiene valores.
- Los nombres largos pueden ocupar dos líneas en móvil, sin puntos suspensivos. No se altera la paleta, la tipografía, el diseño general ni las tarjetas inferiores.
- El tooltip mantiene únicamente fecha, enfermedad con lectura trazable y valor; sin versiones o avisos sobre las curvas. Las discontinuidades entre versiones se conservan.
- Verificación local: 39 pruebas focalizadas y compilación; comparación visual e interacción a 1440, 390 y 360 px, incluyendo alternancia de las entradas sin curva y apertura de los cuatro detalles. Evidencia: `C:/CHAMAN2026/output/disease-chart-audit-2026-09-07/full-legend-checks.json`.
- Sin push ni despliegue; Producción y Testing permanecen intactos.

## Candidato productivo acotado: estilos congelados

El usuario autorizó avanzar hacia Producción únicamente con estas correcciones, sin el rediseño pendiente. Se verificó live en Railway que el frontend productivo (servicio `CHAMAN2026`, ID `5db98e10-7449-44dc-b482-7b7924cc66a0`) sigue en `9529dcc7db5477d2e9d2c7ad0069e5725da5378b`, deployment `8f615b76-b10f-406e-a7c3-0bf1c274bfe4`, estado `SUCCESS`.

- Se retiró `.series-status`, regla sin uso agregada al gráfico durante la primera corrección. El SCSS del gráfico y los 104 archivos CSS/SCSS versionados quedan idénticos a la base productiva.
- El diff operativo se limita al gráfico sanitario, su adaptador de representación y las traducciones de unidades. Los otros archivos son pruebas y esta auditoría. No se modifican cálculos del servidor, configuración, paquetes, autenticación, permisos, licencias, servicios ni registros.
- Control reproducible de alcance aprobado: `C:/CHAMAN2026/output/disease-chart-audit-2026-09-07/check-release-scope.cjs`; resultado `release-scope.json`.
- Batería completa de frontend: **475 pruebas aprobadas** (`release-frontend-tests.log`). Compilación `production`, sin sourcemaps, aprobada (`release-production-build.log`). Auditorías de topología, secretos y logs aprobadas.
- Los controles generales ejecutados reproducen **21/23 aprobados**: el test textual de carga diferida espera la versión anterior a `cargarServiciosAlVolver`; el detector visual señala los dos bordes preexistentes de `.architecture-note` en Licencias. Se confirmó que esos tests, sus fuentes y los estilos son idénticos a `9529dcc`. No son regresiones sanitarias, pero el gate general sigue rojo.
- No se modifica Licencias, no se relajan las pruebas ni se desactiva CI. La publicación productiva queda detenida para tratar por separado esos controles y la divergencia del `main` remoto. La autorización del usuario no se interpreta como permiso para ignorar esos controles o actualizar otros módulos.
- El candidato se prepara en `codex/disease-chart-production-2026-09-07`, sin conectar esa rama a Railway ni modificar la rama productiva compartida con la API. No se ejecutan migraciones, recálculos ni despliegues. El estado anterior permanece como referencia de rollback.

## Autorización posterior: resolver controles conservando el diseño actual

El usuario confirmó conservar el diseño actual y realizar la promoción por Git. Los controles se corrigieron en un commit separado, sin cambios en los archivos de aplicación:

- La prueba de carga diferida reconoce `when cargarServiciosAlVolver`, ya existente en Producción, y comprueba que comienza en `false` y se activa al volver a `manejo-cultivo`; conserva las comprobaciones de viewport, interacción y orden operativo.
- El detector visual sigue prohibiendo nuevas franjas. Para conservar exactamente Licencias se registra el hash SHA-256 de su SCSS normalizado a LF en `9529dcc`: `f8f303ce45e704955096c8679b979f6f6c6e0f8b07b197bda696f17ed7ca358e`. Solo admite las dos declaraciones ya existentes, con archivo, selector, regla y declaración exactos. El test falla si cambia cualquier parte de ese archivo o si se agrega otra franja; se prueba que no puede ampliarse la excepción a otro selector, archivo o grosor. No se apaga CI ni se excluye un módulo entero del análisis.
- Las 24 pruebas de estos controles y responsive aprueban, además de las auditorías de topología, secretos y logs. La batería Angular previa de 475 pruebas y el build productivo corresponden al mismo código de aplicación; este commit solo ajusta tests y documentación.
- La hoja CSS pública de Producción y la compilación candidata comparten el nombre `styles-FOW7C6W4.css`; los 104 archivos CSS/SCSS de origen siguen idénticos. El rediseño no participa en la entrega.

Ruta selectiva prevista: push del SHA final a GitHub, todos los checks aprobados, despliegue de ese SHA en `testing-web` y verificación; luego conectar **solo** `CHAMAN2026` (frontend productivo) a la rama candidata de GitHub y verificar el mismo SHA y assets. No fusionar a `main` desactualizado ni mover la rama compartida con la API. Conservar los deployments e imágenes anteriores y verificar que el resto de los servicios no cambie. Sin `railway up`, cambios de variables, migraciones, escritura en Mongo ni recálculos.
