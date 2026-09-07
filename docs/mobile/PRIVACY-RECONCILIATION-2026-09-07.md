# Privacidad — conciliación técnica previa a tienda

Estado: propuesta pendiente de confirmar y publicar. No se modificó la política
institucional ni la declaración pública en App Store Connect.

## Diferencias verificadas

Apple conserva una declaración publicada por Ezequiel Falcón hace aproximadamente
un año, con cinco tipos: nombre, teléfono, correo, ubicación precisa y fotos/vídeos.
Correo, ubicación y fotos no figuran vinculados a identidad en sus detalles.

Los modelos `foto.ts` y `visita-lote.ts` contienen autor, lote, ubicación y enlaces a
visitas. La app sube imágenes y audios. Esa asociación no permite declarar esos
datos como anónimos. El manifiesto iOS probado ya incluye ocho tipos vinculados.

| Tipo | Evidencia y finalidad observada | Propuesta para Apple |
| --- | --- | --- |
| Nombre | Cuenta y autor de registros | Vinculado; funcionalidad |
| Correo | Cuenta, acceso y contacto | Vinculado; funcionalidad |
| Teléfono | Perfil/contacto cuando se carga | Vinculado; funcionalidad |
| Ubicación precisa | Lotes, visitas y evidencia geolocalizada | Vinculado; funcionalidad |
| Fotos/vídeos | Fotos adjuntas al lote y visitas | Vinculado; funcionalidad |
| Audio | Notas de voz asociadas al lote/visita | Agregar; vinculado; funcionalidad |
| Otro contenido del usuario | Comentarios, observaciones y registros agronómicos | Agregar; vinculado; funcionalidad |
| Identificador de usuario | Cuenta, permisos y autoría | Agregar; vinculado; funcionalidad |

No se encontró SDK publicitario o de seguimiento entre apps en las dependencias
inspeccionadas. No presentar esta búsqueda como auditoría total de todos los
proveedores, logs operativos, usos comerciales o tratamientos fuera del repositorio.
Confirmar si hay analítica, marketing, personalización o retención adicional antes
de retirar finalidades declaradas previamente.

## Política pública

La URL responde HTTP 200. Su texto visible consultado conserva fecha 12/3/2025 y
habla de identidad, campos, cultivos y sensores, pero no describe expresamente
audios, fotos ni notas de campo. El contacto de privacidad publicado es
`info@chamanagro.ar`; debe confirmarse que recibe y atiende solicitudes.

Propuesta de contenido adicional, sujeta a aprobación del titular:

> Cuando elegís adjuntar fotos, notas de voz, comentarios u otros registros de
> campo, Chamán los asocia al lote o a la visita correspondiente y a la cuenta que
> los registra. Si autorizás la ubicación, el registro puede incluir coordenadas.
> Estos datos se usan para prestar las funciones de seguimiento y trazabilidad y
> son accesibles a las personas habilitadas dentro de la organización o red de
> asesoramiento, según los permisos asignados.

Antes de publicar el texto final, definir sin inventar: responsable legal y canal
de derechos; proveedores y transferencias; retención de archivos y copias de
seguridad; mecanismo y alcance de eliminación; uso posterior para entrenamiento o
mejora de modelos si existiera; finalidades comerciales adicionales. No prometer
eliminación instantánea ni afirmar que la cuenta desactivada borra toda su información.

## Cuenta y eliminación

El login no ofrece autorregistro público. Hay creación y eliminación administrativa
de usuarios bajo permisos. No se identificó un flujo de solicitud de eliminación
de la propia cuenta para todos los roles. Se debe revisar la aplicabilidad del
requisito de Apple a esta modalidad organizacional antes del envío. No basta con
confundir la baja/archivo administrativo con eliminación de datos personales.

## Contenido y proveedores

La ficha dice que la app no accede a contenido de terceros, pero hay cartografía,
clima e imágenes satelitales de fuentes externas. Confirmar licencias, atribuciones
y permisos de distribución comercial antes de responder por el titular. No afirmar
que una fuente gratuita equivale automáticamente a un permiso para cualquier uso.

Referencias: [declaraciones de privacidad de Apple](https://developer.apple.com/app-store/app-privacy-details/),
[política actual](https://chamanagro.ar/politica-privacidad/),
[cuentas y eliminación](https://developer.apple.com/support/offering-account-deletion-in-your-app/).
