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
