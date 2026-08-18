import {
  IDispositivo,
  ILorawanRawFrame,
  ILorawanRawReading,
  IReporte,
  IUsuario,
  SensoresV2,
  serviciosDispositivoNormalizados,
} from 'modelos/src';

const RAW_VARIABLE_SENSORS: Record<string, SensoresV2[]> = {
  humedad_suelo: ['Humedad Suelo Profundidad', 'Humedad Suelo Superficial'],
  salinidad_suelo: ['Salinidad Suelo'],
  temperatura_suelo: ['Temperatura Suelo'],
  corriente_analogica: ['Entrada Analógica'],
  nivel_napa: ['Napa'],
  presion_agua: ['Presión'],
  temperatura: ['Temperatura'],
  humedad: ['Humedad'],
  lluvia: ['Pluviometro'],
  pluviometro: ['Pluviometro'],
  viento_velocidad: ['Viento Velocidad'],
  viento_direccion: ['Viento Dirección'],
  presion: ['Presión'],
  evapotranspiracion: ['Evapotranspiración'],
  radiacion_solar: ['Radiación Solar'],
  bateria: ['Batería'],
};

export function esUsuarioAdmin(user?: IUsuario): boolean {
  return !!user?.permisos?.some((permiso) => permiso.nivel === 'Admin');
}

export function proyectarRawHistoryParaDispositivo(
  frames: ILorawanRawFrame[],
  dispositivo: IDispositivo,
  inventarioFisico: IDispositivo,
): ILorawanRawFrame[] {
  const sensores = sensoresPermitidos(dispositivo);
  const serviciosVisibles = serviciosDispositivoNormalizados(dispositivo);
  const serviciosFisicos = serviciosDispositivoNormalizados(inventarioFisico);
  const huellasVisibles = new Set(
    serviciosVisibles.map((servicio) => huellaServicio(servicio)),
  );

  return (frames || []).flatMap((frame) => {
    const readings = (frame.readings || [])
      .filter((reading) =>
        lecturaPermitida(reading, sensores, serviciosFisicos, huellasVisibles),
      )
      .map(proyectarRawReading);

    // Una trama que sólo transportó el servicio ajeno no aporta evidencia al
    // usuario actual. Omitirla evita filtrar la cadencia de ese otro sensor.
    if (!readings.length) return [];

    // Lista blanca deliberada: payloads, objetos decodificados, cobertura de
    // canales y metadatos del decoder pueden reconstruir el servicio oculto.
    return [
      {
        id: frame.id,
        devEUI: frame.devEUI,
        timestamp: frame.timestamp,
        fCnt: frame.fCnt,
        fPort: frame.fPort,
        gatewayID: frame.gatewayID,
        rssi: frame.rssi,
        snr: frame.snr,
        frequency: frame.frequency,
        dr: frame.dr,
        decodeStatus: 'decoded' as const,
        readings,
      },
    ];
  });
}

export function proyectarReporteParaDispositivo(
  reporte: IReporte,
  dispositivo: IDispositivo,
  inventarioFisico: IDispositivo,
): IReporte {
  const sensores = sensoresPermitidosSinAmbiguedad(
    dispositivo,
    inventarioFisico,
  );
  const valores = reporte?.datos?.valores || {};
  const metadata = reporte?.metadataLora;

  // También se reconstruye el nivel superior en vez de propagar propiedades
  // desconocidas que un backend interno pudiera agregar en el futuro.
  return {
    _id: reporte?._id,
    idDispositivo: reporte?.idDispositivo,
    deveui: reporte?.deveui,
    fechaCreacion: reporte?.fechaCreacion,
    fecha: reporte?.fecha,
    estado: reporte?.estado,
    datos: reporte?.datos
      ? {
          valores: Object.fromEntries(
            Object.entries(valores).filter(([sensor]) =>
              sensores.has(sensor as SensoresV2),
            ),
          ),
        }
      : undefined,
    // Señal LoRa básica sirve para diagnosticar la calidad del enlace. Se
    // omiten ubicación del gateway, tenant/app/profile, decoder y canales.
    metadataLora: metadata
      ? {
          frequency: metadata.frequency,
          fCnt: metadata.fCnt,
          fPort: metadata.fPort,
          snr: metadata.snr,
          rssi: metadata.rssi,
          dr: metadata.dr,
        }
      : undefined,
    // Si la consulta interna vino poblada, se reemplaza por la vista que ya
    // filtró DispositivosService; nunca se conserva el populate original.
    dispositivo: reporte?.dispositivo
      ? proyectarDispositivoPoblado(dispositivo)
      : undefined,
  };
}

function sensoresPermitidos(dispositivo: IDispositivo): Set<SensoresV2> {
  const sensores = new Set<SensoresV2>(dispositivo.sensores || []);
  for (const servicio of dispositivo.servicios || []) {
    for (const sensor of servicio.sensores || []) sensores.add(sensor);
  }
  return sensores;
}

function sensoresPermitidosSinAmbiguedad(
  dispositivo: IDispositivo,
  inventarioFisico: IDispositivo,
): Set<SensoresV2> {
  const permitidos = sensoresPermitidos(dispositivo);
  const huellasVisibles = new Set(
    serviciosDispositivoNormalizados(dispositivo).map((servicio) =>
      huellaServicio(servicio),
    ),
  );
  const serviciosOcultos = serviciosDispositivoNormalizados(
    inventarioFisico,
  ).filter((servicio) => !huellasVisibles.has(huellaServicio(servicio)));

  // Los reportes agregados no atribuyen cada valor a un serviceId. Si un
  // servicio oculto declara el mismo sensor, no hay forma segura de saber a
  // cual pertenece el valor y se omite para usuarios no administradores.
  for (const servicio of serviciosOcultos) {
    for (const sensor of servicio.sensores || []) permitidos.delete(sensor);
  }
  return permitidos;
}

function proyectarDispositivoPoblado(dispositivo: IDispositivo): IDispositivo {
  return {
    _id: dispositivo._id,
    deveui: dispositivo.deveui,
    nombre: dispositivo.nombre,
    tipo: dispositivo.tipo,
    sensores: dispositivo.sensores,
    servicios: dispositivo.servicios,
    configuracionLecturas: dispositivo.configuracionLecturas,
    fechaUltimaComunicacion: dispositivo.fechaUltimaComunicacion,
    bateria: dispositivo.bateria,
  };
}

function lecturaPermitida(
  reading: ILorawanRawReading,
  sensores: Set<SensoresV2>,
  serviciosFisicos: ReturnType<typeof serviciosDispositivoNormalizados>,
  huellasVisibles: Set<string>,
): boolean {
  if (reading.serviceId !== undefined && reading.serviceId !== null) {
    const serviceId = String(reading.serviceId).trim();
    if (!serviceId) return false;
    const atribuciones = serviciosFisicos.filter(
      (servicio) => String(servicio.id || '').trim() === serviceId,
    );
    // serviceId es autoritativo. Nunca se cae a la variable: dos propietarios
    // pueden tener servicios distintos que producen el mismo tipo de lectura.
    return (
      atribuciones.length > 0 &&
      atribuciones.every((servicio) =>
        huellasVisibles.has(huellaServicio(servicio)),
      )
    );
  }
  const sensoresVariable = RAW_VARIABLE_SENSORS[String(reading.variable)];
  if (sensoresVariable) {
    return sensoresVariable.some((sensor) => sensores.has(sensor));
  }
  return false;
}

function huellaServicio(
  servicio: ReturnType<typeof serviciosDispositivoNormalizados>[number],
): string {
  return [
    servicio.id,
    servicio.tipo,
    servicio.idProductor,
    servicio.idEstablecimiento,
    servicio.idLote,
  ]
    .map((value) => String(value || ''))
    .join('|');
}

function proyectarRawReading(reading: ILorawanRawReading): ILorawanRawReading {
  return {
    serviceId: reading.serviceId,
    variable: reading.variable,
    value: reading.value,
    unit: reading.unit,
    depthCm: reading.depthCm,
    channel: reading.channel,
    rawValue: reading.rawValue,
    rawUnit: reading.rawUnit,
    reference: reading.reference,
    waterColumnM: reading.waterColumnM,
    installationDepthM: reading.installationDepthM,
    conversionModel: reading.conversionModel,
    quality: reading.quality,
    qualityReason: reading.qualityReason,
    validationReference: reading.validationReference,
  };
}
