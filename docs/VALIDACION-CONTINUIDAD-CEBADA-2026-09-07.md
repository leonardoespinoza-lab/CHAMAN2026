# Continuidad de datos sanitarios de cebada — primera fase

Fecha: 2026-09-07. Estado: implementado y validado localmente; sin push ni despliegue.
Base: b9593a1d9599fc8c6959d1c70603366a7f422cf4.

## Cambios implementados

- El adaptador de cebada distingue horas de mojado ausentes, nulas, vacías, no finitas o fuera de 0–24 h de un cero real. No declara resolución horaria con mojado positivo y temperatura de mojado desconocida.
- Mancha en Red y Escaldadura requieren evidencia de mojado para calcular; un faltante no se transforma en un cero calculado.
- Roya conserva GD/DHR y Fusariosis PMoj/GDN/GDAcum durante días sin datos. No arrastran resultados ni factores diarios como si fueran nuevos.
- La compatibilidad se resuelve por identificador de enfermedad y versión de fórmula 2/3. El nombre legado solo se acepta cuando no hay identificador.
- La marca interna numérica `acumulacionIncompleta: 1` persiste tras huecos de fechas, datos faltantes y suspensión por tratamiento; la calidad permanece baja y la salida provisional/no alertable.
- Se conserva la suspensión de cálculo durante los tratamientos que ya reconoce el sistema, pero se representa como cálculo suspendido sin datos, no como enfermedad cero, ni como desaparición de los acumuladores. No se introduce un modelo de eficacia ni se modifica la clasificación de productos.
- La salida y reentrada fenológica no borran el estado ni la incertidumbre. Fusariosis cerrada por su límite térmico no vuelve a comenzar desde cero.
- Si la última cadena histórica perdió sus acumuladores, no se reconstruye silenciosamente con otra revisión meteorológica. La salida permanece sin datos y requiere reconstrucción controlada.
- Una base cero solo se establece sin lectura previa o cuando la etapa anterior demuestra que aún no había comenzado la ventana y no hay evidencia de acumulación/incertidumbre previa.

## Lo que no cambia

No se modificaron fórmulas compartidas, umbrales agronómicos, componentes web, CSS, colores, bandas, leyendas, permisos, licencias, fuentes meteorológicas ni parámetros de despliegue.

Escaldadura sigue siendo un índice diario: el caso 0 → 24 → 0 se conserva como regresión numérica. Esta fase no lo convierte en una probabilidad ni lo suaviza. La propuesta de eventos, memoria y seguimiento se encuentra en `PLAN-EVENTOS-SANITARIOS-CEBADA-2026-09-07.md` y todavía no se implementó ni activó.

## Verificación

- Suite nueva de continuidad de cebada: **37/37 casos aprobados** mediante `hacerPredicciones` y repositorios/clima simulados.
- Suite completa de API Predicciones: **36 suites, 302 pruebas aprobadas**, sin pruebas omitidas.
- Comprobación semántica TypeScript de API y árbol de importaciones shared: **130 archivos raíz, cero diagnósticos**, sin emitir artefactos de aplicación.
- Revisión independiente del diff: detectó dos escapes de continuidad por `fuera_ventana`; ambos corregidos y cubiertos por regresiones. Revisión final sin hallazgos bloqueantes.
- `git diff --check` aprobado. Diff de `sdc-app-chaman` y `sdc-modelos/src/motores/enfermedades.ts` vacío.

Se reutilizaron dependencias locales sin instalación: Node 22.21.0, Jest/ts-jest/TypeScript existentes. Jest ejecutó con transpilation aislada y se realizó aparte el typecheck semántico completo; no se confunde ejecución de tests con comprobación de tipos. El entorno de CI/construcción de Railway debe verificarse antes del despliegue.

Evidencia local reproducible: `C:/CHAMAN2026/output/barley-input-continuity-2026-09-07/run-qa.cjs`, `qa-results.json` y `typecheck.txt`.

## Límites y siguiente paso

- No hubo consultas nuevas a Producción, escrituras Mongo, migraciones, recálculos de clientes ni notificaciones reales durante esta implementación; los tests usan mocks.
- El parche protege la continuidad futura. No descubre ni reconstruye cadenas antiguas que ya se reiniciaron y ahora aparentan ser cálculos válidos.
- No reconstruye datos meteorológicos faltantes ni resuelve la política de versiones del historial frente a recálculos meteorológicos posteriores.
- Probar primero en Testing por GitHub → Railway, verificando alcance del servicio y las revisiones exactas. No promover a Producción ni recalcular históricos sin autorización y respaldo/plan de reversión.
- La validación de probabilidad de enfermedad requiere un evento objetivo, horizonte y observaciones de campo; no queda acreditada por estas pruebas de software.
