# Registro de modelos propietarios Chamán — Trigo 2026

**Propietario:** Chamán Agro

**Versión ejecutable:** motor sanitario de trigo v5

**Estado de producto:** validación interna para seguimiento; automatización protegida
**Contrato de referencia:** fórmulas y escala varietal aprobadas por el equipo de Chamán

## Alcance de la validación

Las ecuaciones de Mancha Amarilla, Mancha de la Hoja, Roya de la Hoja y Fusarium de la Espiga son modelos propietarios de Chamán. El equipo informa que fueron contrastadas con varias soluciones utilizadas en el mercado. Esa validación interna permite utilizarlas como índices de seguimiento y recorrida.

La promoción a alertas automáticas se mantiene como una aceptación separada. Requiere que cada resultado tenga clima suficiente, ventana activa, resistencia varietal trazable, salida cruda dentro de 0–100 y una lectura vigente. La interfaz puede mostrar la salida contractual limitada a 0–100, pero conserva y señala la saturación cruda para que nunca se convierta silenciosamente en una alarma.

## Contrato matemático aprobado

| Modelo | Fórmula propietaria | Variables | Estado automático |
|---|---|---|---|
| Mancha Amarilla | `(-2,25 + 1,62·DPrHRT + 1,30·DPr) · I` | días de lluvia, combinación lluvia/HR/temperatura y factor varietal | Seguimiento; sin alerta automática |
| Mancha de la Hoja | `(-6,41 + 0,59·DHR + 2,79·DPr) · I` | días húmedos, días de lluvia y factor varietal | Seguimiento; requiere resistencia específica |
| Roya de la Hoja | `4,42 + 0,61·GD + 0,57·DHR - 30,01·(1-I)` | grados térmicos, días húmedos y factor varietal | Seguimiento; la salida se limita a 0–100 y toda saturación cruda queda visible y no alertable |
| Roya Amarilla/Estriada | `5,15 + 0,72·GD + 0,48·DHR + 0,35·DL - 35,2·(1-I)` | contrato diario propietario conservado en sombra | Experimental; la pantalla utiliza cobertura horaria y no alerta |
| Fusarium de la Espiga | `(20,37 + 8,63·PMoj - 0,49·GDN) · I` | períodos de mojado, temperatura desfavorable y factor varietal | Seguimiento dentro de la ventana contractual desde primeras anteras |

La escala varietal aprobada es `S=1`, `MS=0,75`, `MR=0,50` y `R=0,05`. El valor funciona como factor de susceptibilidad: un número mayor aumenta la salida.

## Estados visibles obligatorios

- **Índice Chamán:** cálculo válido para seguimiento interno.
- **Recorrida recomendada:** índice interno sobre el umbral de seguimiento, sin equivaler a una alerta automática.
- **Dato varietal pendiente:** cálculo conservador con `S=1`; requiere completar la resistencia.
- **Sin evaluar:** faltan variables o cobertura; nunca se muestra como cero.
- **Fuera de ventana:** el modelo no corresponde a la etapa actual; nunca se muestra como índice bajo.
- **Índice saturado:** la salida cruda excede 0–100; se muestra el valor contractual limitado junto con la traza cruda y no genera alertas.

## Evidencia para promoción individual

Para promover una enfermedad de seguimiento a alerta automática se debe registrar:

1. versión exacta de la fórmula y fecha de aprobación;
2. modelos o productos de mercado usados en el contraste;
3. lotes, regiones, campañas y variedades evaluadas;
4. observaciones de campo comparables con fecha;
5. falsos positivos, falsos negativos, sensibilidad y especificidad;
6. umbral de alerta aprobado y responsable técnico;
7. prueba de rollback y ausencia de impacto en los demás motores.

La promoción se realiza enfermedad por enfermedad. No se cambia el estado global de trigo y no se modifica el circuito LoRaWAN, sensores, Napa, Sentek, riego ni otros cultivos.
