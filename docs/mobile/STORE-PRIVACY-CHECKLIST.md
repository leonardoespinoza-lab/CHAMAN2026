# Privacidad móvil — checklist previo a publicación

Este documento es una guía de carga. La respuesta final debe coincidir con el
tratamiento real del backend y con la política publicada en
`https://chamanagro.ar/politica-privacidad/`.

## Datos observados en la aplicación

| Categoría de tienda | Uso funcional observado | Acción previa a declarar |
| --- | --- | --- |
| Identidad y contacto | Cuenta, nombre, correo y eventualmente teléfono | Confirmar campos obligatorios y retención |
| Identificador de usuario | Asociación de datos con usuario/tenant | Declarar como vinculado a la identidad |
| Ubicación | Georreferencia de establecimientos, lotes, visitas y evidencias | Confirmar si se conserva ubicación precisa o aproximada |
| Fotos | Evidencia de campo y perfil profesional | Declarar contenido del usuario |
| Audio | Nota de voz de campo | Agregarlo: la ficha histórica de Apple no lo contemplaba |
| Comentarios y visitas | Trazabilidad agronómica | Declarar contenido del usuario |
| Archivos/informes | Exportación y compartido solicitado por el usuario | Confirmar si el servidor conserva el archivo generado |

## Controles antes de responder formularios

- Confirmar que no haya SDK publicitario ni seguimiento entre apps/sitios.
- Confirmar si existen métricas, logs o diagnósticos asociados al usuario.
- Confirmar finalidad de cada dato: funcionalidad, seguridad, soporte o
  analítica.
- Confirmar cifrado en tránsito, retención, eliminación y canal de solicitud.
- Actualizar la política pública si audio, evidencia geolocalizada o nuevos usos
  no están descriptos.
- Completar Apple App Privacy y Google Data safety con las mismas definiciones.

No marcar “no se recopilan datos” mientras fotos, audios, ubicación y registros
de campo se envíen al backend.
