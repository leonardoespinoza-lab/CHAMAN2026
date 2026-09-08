# Chamán 1.6.0 (6): crédito compacto del mapa

Base nativa: `78fb67a`, compilación 5 de privacidad. Se incorporan únicamente los cambios frontend de `c857cac` y `b0b025b` ya comprobados en la web de Producción: crédito compacto abajo a la izquierda, proveedores completos desplegables e icono con clases aisladas. Se conservan las funciones de cuenta y privacidad y la configuración nativa existente.

No se cambia la lógica agronómica, la autenticación ni las URLs de API y WebSocket. Android permanece en versionCode 22; no se genera ni publica una versión Android en este paso.

Esta rama es exclusivamente móvil. No desplegar servicios de Railway desde ella, no fusionar con ramas de Producción y no cambiar bases de datos.

Alcance: preparar, firmar y cargar la compilación 6 a TestFlight interno mediante GitHub Actions con SHA de fuente inmutable. Sin envío a App Review ni publicación pública. La selección del candidato final se realiza después de probar esta compilación, especialmente ingreso, mapa y Cuenta y privacidad; no generar solicitudes de eliminación desde cuentas reales.

Se mantienen el certificado, el perfil y los secretos de firma existentes sin exponer sus valores. La ficha de App Store aún requiere seleccionar el candidato final; el estado de TestFlight no implica revisión ni aprobación pública.
