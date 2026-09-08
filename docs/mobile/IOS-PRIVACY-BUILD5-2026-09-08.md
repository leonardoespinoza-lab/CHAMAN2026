# Chamán 1.6.0 (5): candidato de privacidad

Preparado a partir de `e839a40`, que conserva la base nativa de la compilación 4 probada y añade Cuenta y privacidad, bandeja administrativa y atribuciones cartográficas. El manifiesto declara nueve tipos de datos funcionales, vinculados al usuario y sin seguimiento.

Las pantallas coinciden con `e927411` validado en Testing. Las únicas diferencias dentro de `sdc-app-chaman/src` son la versión 1.6.0 y la configuración de ejecución nativa existente: API/WS de Producción y demanda hídrica habilitada en nativo. No hay rediseño ni modificaciones a cálculos agronómicos.

**Esta rama es exclusivamente para compilar iOS. No debe usarse para desplegar servidores:** no contiene los arreglos posteriores del backend de suelo. Los servidores se promueven separadamente desde `e927411`.

Alcance: firma y carga a TestFlight interno. No enviar a App Review, no publicar en App Store. El usuario debe probar esta compilación nueva antes de seleccionar el candidato final. La eliminación es un trámite persistido y atendido por Administración, no un borrado automático; no ensayar sobre cuentas reales.

El flujo CI debe apuntar a un SHA de fuente inmutable y comprobar versión/build antes de la carga. Se conservan los perfiles y secretos existentes sin exponer sus valores.
