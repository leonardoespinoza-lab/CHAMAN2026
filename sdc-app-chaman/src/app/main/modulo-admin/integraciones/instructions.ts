import { API_SERVICES, ApiClientView } from 'modelos/src';

/** Plain text intentionally: printable, copyable, no HTML injection or secret fields. */
export function integrationInstructions(client: ApiClientView, baseUrl: string, active: boolean): string {
  const lines = [
    `CHAMÁN · Instructivo de integración · ${client.name}`,
    `Identificador: ${client.id} | Entorno: ${client.environment} | Configuración: ${client.revision}`,
    `Vencimiento: ${client.expiresAt} (UTC)`,
    `Acceso: ${active && client.enabled && Date.parse(client.expiresAt) > Date.now() && client.keys.some((k) => Date.parse(k.expiresAt) > Date.now()) ? 'habilitado según configuración; sujeto al plan y permisos de la cuenta' : 'pendiente, suspendido o vencido: confirmar habilitación antes de conectar'}`,
    '',
    'CONEXIÓN',
    baseUrl,
    'HTTPS. Encabezado x-api-key: CLAVE_ENTREGADA_POR_CANAL_SEGURO.',
    'No utilizar la contraseña de Chamán. Guardar la clave sólo en el servidor propio, nunca en una web, app móvil, URL, repositorio o archivo compartido.',
    '',
    'SERVICIOS HABILITADOS',
    ...API_SERVICES.filter((s) => client.scopes.includes(s.scope)).map((s) => `• ${s.nombre} (${s.scope})`),
    '',
    'CUPOS',
    `${client.limits.productores} productores · ${client.limits.establecimientos} establecimientos · ${client.limits.lotes} lotes. Incluyen los recursos activos de esta cartera creados desde Chamán. No son cantidades de consultas.`,
    `${client.requestsPerMinute} solicitudes/minuto. Siembra histórica: hasta ${client.maxSowingAgeDays} días para nuevas altas.`,
    '',
    'COMPROBACIÓN INICIAL',
    'GET /servicios',
    'Enviar x-api-key en cada llamada. En las escrituras agregar Content-Type: application/json.',
  ];
  if (client.scopes.includes('catalogos:leer'))
    lines.push(
      '',
      'CATÁLOGO',
      'GET /catalogos/semillas?cultivo=Trigo&pagina=0',
      'Consultar las siguientes páginas para completar el catálogo (100 resultados por página). Conservar el idSemilla devuelto.'
    );
  if (client.scopes.includes('estructura:crear'))
    lines.push(
      '',
      'ALTAS EN ORDEN · ejemplos ficticios: reemplazar por datos reales',
      'PUT /productores/productor-001',
      JSON.stringify({ nombre: 'Productor ejemplo' }),
      'PUT /establecimientos/campo-001',
      JSON.stringify({ nombre: 'Campo ejemplo', productorIdExterno: 'productor-001' }),
      'ALTERNATIVA SIN PRODUCTOR: para un campo propio del asesor autenticado, omitir el alta de productor y usar el siguiente cuerpo en PUT /establecimientos/campo-propio-001. No combinar ambos modos.',
      JSON.stringify({ nombre: 'Campo propio del asesor', carteraPropiaAsesor: true }),
      'Luego crear el lote con el ID del establecimiento elegido y su siembra. La propiedad se toma del acceso autenticado, no se envía un ID de asesor.',
      'PUT /lotes/lote-001',
      JSON.stringify({
        nombre: 'Lote ejemplo',
        establecimientoIdExterno: 'campo-001',
        ubicacion: { lat: -33, lng: -62 },
        superficieHa: 50,
      }),
      'PUT /siembras/siembra-001',
      JSON.stringify({ loteIdExterno: 'lote-001', idSemilla: 'ID_REAL_DEL_CATALOGO', fechaSiembra: 'YYYY-MM-DD' }),
      'Usar IDs externos propios, estables y únicos por recurso: 1–80 letras, números, punto, guion o guion bajo. El mismo PUT con el mismo contenido no duplica. Un contenido distinto con el mismo ID devuelve 409; no reemplaza datos.',
      'Una siembra activa por lote. Esta versión recibe ubicación central y superficie, no polígonos. No crea contraseñas ni usuarios humanos por API.'
    );
  if (client.scopes.includes('estructura:leer'))
    lines.push(
      '',
      'CONSULTAS',
      'GET /productores/{idExterno}',
      'GET /establecimientos/{idExterno}',
      'GET /lotes/{idExterno}',
      'GET /siembras/{idExterno}'
    );
  if (client.scopes.includes('fenologia:leer'))
    lines.push(
      '',
      'FENOLOGÍA',
      'GET /siembras/{idExterno}/fenologia',
      'La respuesta informa estado, etapa procesada, fuente, fecha y revisión; no entrega la base de algoritmos. La creación de la siembra puede iniciar un cálculo asíncrono.',
      '202: cálculo pendiente; repetir con espera progresiva. 200: interpretar el campo estado y la fecha antes de usar la etapa. ETag: conservarlo y enviar If-None-Match en la próxima consulta; 304 indica que no cambió.',
      'Consultar periódicamente respetando los límites. Esta versión NO envía webhooks ni requiere una conexión abierta permanente.'
    );
  lines.push(
    '',
    'ERRORES Y SOPORTE',
    '400: revisar datos. 401: clave incorrecta, suspendida o vencida. 403: permiso, plan o cupo. 404: recurso no accesible. 409: conflicto; verificar el contenido original. 429: respetar Retry-After. 503: reintentar con espera progresiva.',
    'Enviar X-Request-Id al soporte, nunca la clave ni contraseñas. Contacto: info@chamanagro.ar.',
    'Cada intento autenticado cuenta como consulta, incluidos reintentos, respuestas 202/304, errores de permiso y límite. Una consulta no equivale a un nuevo cálculo agronómico. El reporte es operativo, no una factura.',
    '',
    'GUARDAR COMO PDF: Imprimir → destino Guardar como PDF. Las claves se entregan por separado.'
  );
  return lines.join('\n');
}
