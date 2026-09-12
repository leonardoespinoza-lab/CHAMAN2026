/** Commercial catalogue, NOT an authorization list or a list of public routes.
 * Adding an entry here never opens an endpoint or grants access to a client.
 */
export const API_SERVICE_GROUPS = [
  "Estructura y cultivos",
  "Sanidad y manejo",
  "Agua y suelo",
  "Meteorología",
  "Satélite y dispositivos",
  "Registros y seguimiento",
] as const;
export const API_SERVICE_CATALOG = [
  {
    codigo: "estructura",
    nombre: "Productores, establecimientos, lotes y siembras",
    grupo: "Estructura y cultivos",
    salida: "Alta y consulta de la estructura vinculada al cliente.",
    requisitos: "Asesor activo, cupos y permisos de lectura o escritura.",
    estado: "conectado",
  },
  {
    codigo: "catalogos",
    nombre: "Catálogo de cultivos y semillas",
    grupo: "Estructura y cultivos",
    salida:
      "Cultivos, variedades y semillas disponibles para registrar siembras.",
    requisitos: "No incluye parámetros de los modelos.",
    estado: "conectado",
  },
  {
    codigo: "fenologia",
    nombre: "Fenología",
    grupo: "Estructura y cultivos",
    salida: "Etapa procesada, fecha, origen y estado de actualización.",
    requisitos:
      "Siembra y datos suficientes; validar coincidencia con la pantalla antes del piloto productivo.",
    estado: "conectado",
  },
  {
    codigo: "malezas",
    nombre: "Predicción de nacimiento de malezas",
    grupo: "Sanidad y manejo",
    salida: "Emergencia estimada por especie, evolución y proyección.",
    requisitos:
      "Lote con o sin siembra; clima superficial suficiente. No incluye fórmula ni coeficientes.",
    estado: "pendiente",
  },
  {
    codigo: "enfermedades",
    nombre: "Enfermedades",
    grupo: "Sanidad y manejo",
    salida: "Indicadores procesados por enfermedad y evolución temporal.",
    requisitos:
      "Cultivo compatible y lectura con calidad y ventana sanitaria identificadas; no confundir índice con incidencia observada.",
    estado: "pendiente",
  },
  {
    codigo: "viento-aplicacion",
    nombre: "Viento y ventana de aplicación",
    grupo: "Sanidad y manejo",
    salida:
      "Viento, ráfagas, dirección y condiciones procesadas para la aplicación.",
    requisitos:
      "Ubicación y meteorología vigente; salida informativa, sin accionar equipos.",
    estado: "pendiente",
  },
  {
    codigo: "riego",
    nombre: "Riego",
    grupo: "Agua y suelo",
    salida: "Necesidad estimada de riego, fecha y cantidad recomendada.",
    requisitos:
      "Siembra y configuración hídrica suficiente; sin control remoto de bombas o válvulas.",
    estado: "pendiente",
  },
  {
    codigo: "evapotranspiracion",
    nombre: "Evapotranspiración",
    grupo: "Agua y suelo",
    salida: "ET₀, consumo del cultivo y acumulados, con unidades y período.",
    requisitos:
      "Distinguir referencia meteorológica de demanda del cultivo; no entregar parámetros internos.",
    estado: "pendiente",
  },
  {
    codigo: "balance-hidrico",
    nombre: "Balance y estrés hídrico",
    grupo: "Agua y suelo",
    salida: "Agua disponible, déficit, balance y estado hídrico procesado.",
    requisitos:
      "Contexto de suelo, cultivo y cobertura de datos; no convertir faltantes en cero.",
    estado: "pendiente",
  },
  {
    codigo: "huella-hidrica",
    nombre: "Huella hídrica",
    grupo: "Agua y suelo",
    salida: "Componentes verde, azul y gris; total y estado de consolidación.",
    requisitos:
      "Datos agronómicos y rendimiento suficientes; distinguir seguimiento de resultado consolidado.",
    estado: "pendiente",
  },
  {
    codigo: "suelo-perfil",
    nombre: "Perfil de suelo y ambiente",
    grupo: "Agua y suelo",
    salida: "Textura, composición y capacidad hídrica por profundidad.",
    requisitos:
      "Conservar fuente, profundidad y confianza; revisar condiciones de redistribución de cada proveedor.",
    estado: "pendiente",
  },
  {
    codigo: "clima-actual",
    nombre: "Meteorología actual",
    grupo: "Meteorología",
    salida: "Condiciones actuales para la ubicación del lote.",
    requisitos:
      "Distinguir medición de estimación y conservar fecha, unidades, fuente y licencia de uso.",
    estado: "pendiente",
  },
  {
    codigo: "clima-historico",
    nombre: "Historial meteorológico",
    grupo: "Meteorología",
    salida:
      "Series históricas de temperatura, humedad, lluvia, viento y otras variables disponibles.",
    requisitos:
      "Intervalos y resolución acotados, sin descargar la base completa; revisar redistribución por fuente.",
    estado: "pendiente",
  },
  {
    codigo: "clima-pronostico",
    nombre: "Predicción meteorológica",
    grupo: "Meteorología",
    salida:
      "Pronóstico por fecha y variable, con emisión y horizonte identificados.",
    requisitos:
      "No presentarlo como observación; limitar horizonte y revisar redistribución por fuente.",
    estado: "pendiente",
  },
  {
    codigo: "suelo-meteorologico",
    nombre: "Temperatura y humedad de suelo",
    grupo: "Meteorología",
    salida: "Temperatura y agua volumétrica estimadas por capa de suelo.",
    requisitos:
      "Profundidad, unidades y origen explícitos; no sustituir una sonda medida sin indicarlo.",
    estado: "pendiente",
  },
  {
    codigo: "frio-termica",
    nombre: "Frío y acumulación térmica",
    grupo: "Meteorología",
    salida:
      "Grados día, horas y porciones de frío, y otros acumulados procesados disponibles.",
    requisitos:
      "Inicio y cobertura del período; no exponer umbrales varietales o fórmulas internas.",
    estado: "pendiente",
  },
  {
    codigo: "riesgos-agroclimaticos",
    nombre: "Riesgos agroclimáticos",
    grupo: "Meteorología",
    salida:
      "Indicadores de helada, calor y otras condiciones de riesgo disponibles.",
    requisitos:
      "Contexto del cultivo, vigencia y calidad; adaptar las salidas del motor vigente.",
    estado: "pendiente",
  },
  {
    codigo: "satelite",
    nombre: "Índices satelitales",
    grupo: "Satélite y dispositivos",
    salida: "NDVI, NDMI, NDWI, NDRE, SAVI y EVI; fechas, evolución y calidad.",
    requisitos:
      "Geometría real del lote y escenas válidas. El alta externa actual recibe un punto, no un polígono.",
    estado: "pendiente",
  },
  {
    codigo: "sensores",
    nombre: "Sensores y estaciones",
    grupo: "Satélite y dispositivos",
    salida: "Mediciones y series de los dispositivos vinculados al cliente.",
    requisitos:
      "Propiedad del equipo, profundidad, unidad y vigencia; sin claves ni tramas privadas del dispositivo.",
    estado: "pendiente",
  },
  {
    codigo: "napas",
    nombre: "Nivel de napa",
    grupo: "Satélite y dispositivos",
    salida: "Profundidad de napa, columna de agua y evolución.",
    requisitos: "Equipo vinculado y referencia del terreno configurada.",
    estado: "pendiente",
  },
  {
    codigo: "camaras",
    nombre: "Cámaras de campo",
    grupo: "Satélite y dispositivos",
    salida: "Imágenes autorizadas y sus fechas de captura.",
    requisitos:
      "Autorización del propietario y acceso temporal seguro, sin credenciales del equipo.",
    estado: "pendiente",
  },
  {
    codigo: "fertilizaciones",
    nombre: "Fertilizaciones",
    grupo: "Registros y seguimiento",
    salida: "Registros agronómicos de fertilización del cliente.",
    requisitos:
      "Separar consulta de registros de futuras altas o modificaciones por API.",
    estado: "pendiente",
  },
  {
    codigo: "fumigaciones",
    nombre: "Fumigaciones y carga fitosanitaria",
    grupo: "Registros y seguimiento",
    salida: "Registros de aplicaciones e indicadores procesados disponibles.",
    requisitos:
      "Sólo registros propios; sin recomendaciones automáticas nuevas ni acciones sobre equipos.",
    estado: "pendiente",
  },
  {
    codigo: "registro-campo",
    nombre: "Registros y fotografías de campo",
    grupo: "Registros y seguimiento",
    salida: "Observaciones y fotografías autorizadas del lote.",
    requisitos:
      "Filtrar datos personales y archivos; acceso acotado a la cartera propia.",
    estado: "pendiente",
  },
  {
    codigo: "visitas",
    nombre: "Visitas y seguimiento agronómico",
    grupo: "Registros y seguimiento",
    salida: "Calendario y registros de visitas de la cartera del cliente.",
    requisitos:
      "Separar lectura de agenda de futuras operaciones de escritura.",
    estado: "pendiente",
  },
  {
    codigo: "informes",
    nombre: "Informes agronómicos",
    grupo: "Registros y seguimiento",
    salida: "Resultados consolidados e informes del lote.",
    requisitos:
      "Revisar permisos y datos incluidos antes de permitir exportaciones externas.",
    estado: "pendiente",
  },
  {
    codigo: "alertas",
    nombre: "Alertas",
    grupo: "Registros y seguimiento",
    salida: "Alertas propias, fecha, prioridad y estado.",
    requisitos:
      "Consultar alertas no equivale a habilitar notificaciones, correos o webhooks.",
    estado: "pendiente",
  },
] as const;
export type ApiServiceCode = (typeof API_SERVICE_CATALOG)[number]["codigo"];
export type ApiPendingServiceCode = Extract<
  (typeof API_SERVICE_CATALOG)[number],
  { estado: "pendiente" }
>["codigo"];
export const API_PENDING_SERVICES = API_SERVICE_CATALOG.filter(
  (s) => s.estado === "pendiente",
);
/** Requests are administrative intent only, never runtime permissions. */
export const validApiRequestedServices = (
  value: unknown,
): value is ApiPendingServiceCode[] =>
  Array.isArray(value) &&
  value.length <= API_PENDING_SERVICES.length &&
  new Set(value).size === value.length &&
  value.every((code) => API_PENDING_SERVICES.some((s) => s.codigo === code));
