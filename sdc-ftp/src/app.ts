import express, { Request, Response } from "express";
import FtpSrv, { FtpServerOptions } from "ftp-srv";
import fs from "fs";
import path from "path";
import {
  API_DATOS,
  FTP_ANONYMOUS,
  FTP_ALLOW_ACTIVE_BEHIND_PROXY,
  FTP_CAMERA_PASSWORD,
  FTP_DATA_DIR,
  FTP_HOST,
  FTP_PASV_MAX,
  FTP_PASV_MIN,
  FTP_PASV_URL,
  FTP_PUBLIC_PORT,
  FTP_PORT,
  FTP_SHARED_USERNAME,
  FTP_URL,
  HIKCONNECT_CAPTURE_ON_START,
  HIKCONNECT_DEFAULT_CHANNEL,
  HIKCONNECT_ENABLED,
  HIKCONNECT_SCHEDULER_INTERVAL_MINUTES,
  HTTP_PORT,
  HTTP_PUBLIC_PORT,
  PUBLIC_BASE_URL,
  TIMELAPSE_ADMIN_TOKEN,
} from "./enviroments/environment";
import { HikConnectClient } from "./hik-connect";
import { ICamara, IFoto, IListado, ILote } from "modelos";
import {
  assertValidFieldAudio,
  assertValidFieldPhoto,
  buildFieldAudioStoragePlan,
  buildFieldPhotoStoragePlan,
  hasOperationalAccess,
  privateFieldAudioAccess,
  privateFieldPhotoAccess,
} from "./field-photo-security";

const FtpFileSystem: any = require("ftp-srv/src/fs");

type UploadRecord = {
  serialCamara: string;
  originalName: string;
  storedName: string;
  relativePath: string;
  publicUrl: string;
  size: number;
  fechaCaptura: string;
  fuente: IFoto["fuente"];
  canalCamara?: number;
  metadata?: Record<string, unknown>;
  idLote?: string;
  loteNombre?: string;
  status: "linked" | "pending";
};

const recentUploads: UploadRecord[] = [];
const fetchFn = (globalThis as any).fetch as (input: string, init?: any) => Promise<any>;
const hikConnect = new HikConnectClient();
let scheduledCaptureRunning = false;

class AutoCreateFileSystem extends FtpFileSystem {
  constructor(...args: any[]) {
    super(...args);
  }

  chdir(dir = ".") {
    return super.chdir(dir).catch((err: any) => {
      if (err?.code !== "ENOENT") throw err;
      const { fsPath } = this._resolvePath(dir);
      fs.mkdirSync(fsPath, { recursive: true });
      return super.chdir(dir);
    });
  }

  write(fileName: string, options: any) {
    const { fsPath } = this._resolvePath(fileName);
    fs.mkdirSync(path.dirname(fsPath), { recursive: true });
    return super.write(fileName, options);
  }
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function sanitizeSegment(value: string, fallback = "sin-serie") {
  const clean = String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^\.+$/, "");

  return clean || fallback;
}

function isImageFile(fileName: string) {
  return /\.(jpe?g|png|webp)$/i.test(fileName);
}

function serialFromFilePrefix(fileName: string) {
  const base = path.basename(fileName, path.extname(fileName));
  const withoutHikvisionTimestamp = base
    .replace(/[_-]\d{8}[_-]?\d{6}.*$/g, "")
    .replace(/[_-]\d{14}.*$/g, "")
    .replace(/[_-]\d{4}[_-]\d{2}[_-]\d{2}.*$/g, "");

  const candidate = withoutHikvisionTimestamp || base;
  return sanitizeSegment(candidate, "sin-serie").toUpperCase();
}

function serialFromLoginOrFile(username: string, fileName: string) {
  const normalizedUser = sanitizeSegment(username).toLowerCase();
  const sharedUser = sanitizeSegment(FTP_SHARED_USERNAME).toLowerCase();

  if (normalizedUser && normalizedUser !== "anonymous" && normalizedUser !== sharedUser) {
    return sanitizeSegment(username).toUpperCase();
  }

  return serialFromFilePrefix(fileName);
}

function publicUrlFor(relativePath: string, req?: Request) {
  const normalized = relativePath.split(path.sep).join("/");
  if (PUBLIC_BASE_URL) {
    return `${PUBLIC_BASE_URL.replace(/\/$/, "")}/imagenes/${normalized}`;
  }

  if (req) {
    return `${req.protocol}://${req.get("host")}/imagenes/${normalized}`;
  }

  return `/imagenes/${normalized}`;
}

function publicAudioUrlFor(relativePath: string, req?: Request) {
  const normalized = relativePath.split(path.sep).join('/');
  if (PUBLIC_BASE_URL) {
    return `${PUBLIC_BASE_URL.replace(/\/$/, '')}/audios/${normalized}`;
  }
  if (req) return `${req.protocol}://${req.get('host')}/audios/${normalized}`;
  return `/audios/${normalized}`;
}

function extensionFromContentType(contentType: string) {
  if (/png/i.test(contentType)) return "png";
  if (/webp/i.test(contentType)) return "webp";
  return "jpg";
}

function ingestFieldPhoto(
  idLote: string,
  originalName: string,
  contentType: string,
  bytes: Buffer,
) {
  assertValidFieldPhoto(bytes, contentType);
  const fechaCaptura = new Date().toISOString();
  const storage = buildFieldPhotoStoragePlan({
    baseDir: FTP_DATA_DIR,
    idLote,
    originalName,
    contentType,
    capturedAt: new Date(fechaCaptura),
    nonce: `${Date.now()}`,
  });
  ensureDir(storage.targetDir);
  fs.writeFileSync(storage.targetPath, bytes);

  return {
    idLote,
    originalName,
    storedName: storage.storedName,
    relativePath: storage.relativePath,
    publicUrl: publicUrlFor(storage.relativePath),
    size: bytes.length,
    contentType,
    fechaCaptura,
    fuente: 'campo' as const,
  };
}

function ingestFieldAudio(
  idLote: string,
  originalName: string,
  contentType: string,
  bytes: Buffer,
) {
  assertValidFieldAudio(bytes, contentType);
  const fechaCaptura = new Date().toISOString();
  const storage = buildFieldAudioStoragePlan({
    baseDir: FTP_DATA_DIR,
    idLote,
    originalName,
    contentType,
    capturedAt: new Date(fechaCaptura),
    nonce: `${Date.now()}`,
  });
  ensureDir(storage.targetDir);
  fs.writeFileSync(storage.targetPath, bytes);
  return {
    idLote,
    originalName,
    storedName: storage.storedName,
    relativePath: storage.relativePath,
    publicUrl: publicAudioUrlFor(storage.relativePath),
    size: bytes.length,
    contentType,
    fechaCaptura,
    fuente: 'campo' as const,
    tipoMedio: 'audio' as const,
  };
}

function tokenExpiresAtIso(expireTime?: number) {
  if (!expireTime) return null;
  const ms = expireTime > 10_000_000_000 ? expireTime : expireTime * 1000;
  return new Date(ms).toISOString();
}

function requireAdminToken(req: Request, res: Response, next: () => void) {
  if (!TIMELAPSE_ADMIN_TOKEN) {
    res.status(503).json({
      ok: false,
      message: "Servicio operativo no configurado.",
    });
    return;
  }

  if (
    hasOperationalAccess(
      {
        authorization: req.get("authorization") || "",
        explicitToken: req.get("x-timelapse-token") || "",
      },
      TIMELAPSE_ADMIN_TOKEN,
    )
  ) {
    next();
    return;
  }

  res.status(401).json({ ok: false, message: "Token operativo requerido." });
}

function pushRecent(record: UploadRecord) {
  recentUploads.unshift(record);
  recentUploads.splice(50);
}

async function findLotesBySerial(serialCamara: string): Promise<ILote[]> {
  const filter = { serialCamara };
  const url = new URL(`${API_DATOS}/lotes`);
  url.searchParams.set("filter", JSON.stringify(filter));
  url.searchParams.set("limit", "0");

  const response = await fetchFn(url.toString());
  if (!response.ok) {
    throw new Error(`sdc-datos rechazo consulta de lotes: ${response.status}`);
  }

  const data = (await response.json()) as IListado<ILote>;

  return data?.datos || [];
}

async function registerFoto(record: UploadRecord) {
  const lotes = await findLotesBySerial(record.serialCamara);
  if (!lotes.length) {
    console.warn(`Camara ${record.serialCamara} sin lote vinculado. Foto queda pendiente.`);
    return;
  }

  await Promise.all(
    lotes.map(async (lote: ILote) => {
      const data: IFoto = {
        url: record.publicUrl,
        idLote: lote._id,
        fechaCreacion: record.fechaCaptura,
        fuente: record.fuente,
        serialCamara: record.serialCamara,
        canalCamara: record.canalCamara,
        nombreOriginal: record.originalName,
        metadata: record.metadata,
      };
      const response = await fetchFn(`${API_DATOS}/fotos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`sdc-datos rechazo registro de foto: ${response.status}`);
      }

      record.idLote = lote._id;
      record.loteNombre = lote.nombre;
      record.status = "linked";
    }),
  );
}

async function ingestUpload(username: string, fileName: string) {
  const originalName = path.basename(fileName);
  if (!isImageFile(originalName)) {
    console.warn(`Archivo ignorado por extension no soportada: ${originalName}`);
    return;
  }

  const serialCamara = serialFromLoginOrFile(username, originalName);
  const fechaCaptura = new Date().toISOString();
  const day = fechaCaptura.slice(0, 10);
  const storedName = `${Date.now()}-${sanitizeSegment(originalName, "foto.jpg")}`;
  const cameraDir = path.join(FTP_DATA_DIR, serialCamara, day);
  ensureDir(cameraDir);

  const sourcePath = path.resolve(fileName);
  const targetPath = path.join(cameraDir, storedName);
  fs.renameSync(sourcePath, targetPath);

  const relativePath = path.relative(FTP_DATA_DIR, targetPath);
  const record: UploadRecord = {
    serialCamara,
    originalName,
    storedName,
    relativePath,
    publicUrl: publicUrlFor(relativePath),
    size: fs.statSync(targetPath).size,
    fechaCaptura,
    fuente: "ftp",
    status: "pending",
  };

  try {
    await registerFoto(record);
  } catch (err) {
    console.error("No se pudo registrar la foto en sdc-datos:", err);
  }

  pushRecent(record);
  console.log("Foto time-lapse recibida:", record);
}

async function ingestHikConnectCapture(serialCamara: string, channelNo = HIKCONNECT_DEFAULT_CHANNEL) {
  const serial = sanitizeSegment(serialCamara, "sin-serie").toUpperCase();
  const capture = await hikConnect.capturePicture(serial, channelNo);
  const download = await hikConnect.downloadCapture(capture.captureUrl, capture.isEncrypted);
  const fechaCaptura = new Date().toISOString();
  const day = fechaCaptura.slice(0, 10);
  const extension = extensionFromContentType(download.contentType);
  const originalName = `hik-connect-channel-${channelNo}.${extension}`;
  const storedName = `${Date.now()}-${sanitizeSegment(originalName, "foto.jpg")}`;
  const cameraDir = path.join(FTP_DATA_DIR, serial, day);
  ensureDir(cameraDir);

  const targetPath = path.join(cameraDir, storedName);
  fs.writeFileSync(targetPath, download.bytes);

  const relativePath = path.relative(FTP_DATA_DIR, targetPath);
  const record: UploadRecord = {
    serialCamara: serial,
    canalCamara: channelNo,
    originalName,
    storedName,
    relativePath,
    publicUrl: publicUrlFor(relativePath),
    size: fs.statSync(targetPath).size,
    fechaCaptura,
    fuente: "hik-connect",
    status: "pending",
    metadata: {
      provider: "hik-connect-for-teams",
      contentType: download.contentType,
      encrypted: download.encrypted,
      rawContentType: download.rawContentType,
      rawSize: download.rawSize,
      captureUrlExpiresInMinutes: 15,
    },
  };

  await registerFoto(record);
  pushRecent(record);
  console.log("Foto time-lapse Hik-Connect recibida:", record);

  return record;
}

async function captureLinkedHikConnectCameras() {
  const url = new URL(`${API_DATOS}/lotes`);
  url.searchParams.set("filter", JSON.stringify({ serialCamara: { $exists: true, $ne: "" } }));
  url.searchParams.set("limit", "0");

  const response = await fetchFn(url.toString());
  if (!response.ok) {
    throw new Error(`sdc-datos rechazo consulta de lotes con camara: ${response.status}`);
  }

  const data = (await response.json()) as IListado<ILote>;
  const seriales = Array.from(new Set((data?.datos || []).map((lote) => lote.serialCamara).filter(Boolean))) as string[];
  const results = [];

  for (const serial of seriales) {
    try {
      results.push(await ingestHikConnectCapture(serial));
    } catch (err: any) {
      results.push({ serialCamara: serial, status: "error", message: err?.message || String(err) });
      console.error(`No se pudo capturar Hik-Connect ${serial}:`, err);
    }
  }

  return results;
}

function minutesFromNowIso(minutes: number) {
  const safeMinutes = Math.max(1, Number(minutes || 1));
  return new Date(Date.now() + safeMinutes * 60 * 1000).toISOString();
}

function parseClockMinutes(value?: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return hour * 60 + minute;
}

function minuteOfDay(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function isWithinCaptureWindow(camara: ICamara, now = new Date()) {
  const start = parseClockMinutes(camara.capturaAutomatica?.horaInicio);
  const end = parseClockMinutes(camara.capturaAutomatica?.horaFin);
  if (start === null || end === null || start === end) return true;

  const current = minuteOfDay(now);
  if (start < end) {
    return current >= start && current <= end;
  }

  return current >= start || current <= end;
}

function minutesUntilCaptureWindow(camara: ICamara, now = new Date()) {
  if (isWithinCaptureWindow(camara, now)) return 0;

  const start = parseClockMinutes(camara.capturaAutomatica?.horaInicio);
  if (start === null) return Number(camara.capturaAutomatica?.reintentoMinutos || 10);

  const current = minuteOfDay(now);
  let delta = start - current;
  if (delta <= 0) delta += 24 * 60;
  return Math.max(1, delta);
}

function isCameraCaptureDue(camara: ICamara, now = new Date()) {
  const config = camara.capturaAutomatica;
  if (!config?.habilitada) return false;
  if (!config.proximoIntento) return true;

  const next = new Date(config.proximoIntento).getTime();
  return Number.isNaN(next) || next <= now.getTime();
}

async function getScheduledHikConnectCameras(): Promise<ICamara[]> {
  const url = new URL(`${API_DATOS}/camaras`);
  url.searchParams.set("limit", "0");
  url.searchParams.set("sort", "nombre");

  const response = await fetchFn(url.toString());
  if (!response.ok) {
    throw new Error(`sdc-datos rechazo consulta de camaras: ${response.status}`);
  }

  const data = (await response.json()) as IListado<ICamara>;
  return (data?.datos || []).filter(
    (camara) =>
      !!camara.serialCamara &&
      camara.fuente === "hik-connect" &&
      camara.capturaAutomatica?.habilitada === true,
  );
}

async function updateCameraCaptureState(
  camara: ICamara,
  patch: NonNullable<ICamara["capturaAutomatica"]>,
) {
  const capturaAutomatica = {
    ...(camara.capturaAutomatica || {}),
    ...patch,
  };
  const response = await fetchFn(
    `${API_DATOS}/camaras/${encodeURIComponent(camara.serialCamara)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capturaAutomatica }),
    },
  );

  if (!response.ok) {
    throw new Error(`sdc-datos rechazo estado de captura: ${response.status}`);
  }

  camara.capturaAutomatica = capturaAutomatica;
}

async function captureScheduledHikConnectCameras(reason = "interval") {
  if (!HIKCONNECT_ENABLED || scheduledCaptureRunning) {
    return [];
  }

  scheduledCaptureRunning = true;
  const results: Array<Record<string, unknown>> = [];

  try {
    const camaras = await getScheduledHikConnectCameras();
    const now = new Date();

    for (const camara of camaras) {
      if (!isCameraCaptureDue(camara, now)) {
        continue;
      }

      const config = camara.capturaAutomatica || {};
      const retryMinutes = Math.max(5, Number(config.reintentoMinutos || 10));
      const intervalMinutes = Math.max(15, Number(config.intervaloMinutos || 1440));

      if (!isWithinCaptureWindow(camara, now)) {
        const nextWindowMinutes = minutesUntilCaptureWindow(camara, now);
        await updateCameraCaptureState(camara, {
          estado: "fuera_de_ventana",
          ultimoIntento: now.toISOString(),
          proximoIntento: minutesFromNowIso(nextWindowMinutes || retryMinutes),
        });
        results.push({
          serialCamara: camara.serialCamara,
          status: "fuera_de_ventana",
          reason,
        });
        continue;
      }

      try {
        const record = await ingestHikConnectCapture(
          camara.serialCamara,
          camara.canal || HIKCONNECT_DEFAULT_CHANNEL,
        );
        await updateCameraCaptureState(camara, {
          estado: "ok",
          ultimoIntento: now.toISOString(),
          ultimoExito: new Date().toISOString(),
          ultimoError: "",
          proximoIntento: minutesFromNowIso(intervalMinutes),
        });
        results.push({ serialCamara: camara.serialCamara, status: "ok", record });
      } catch (err: any) {
        const message = err?.message || String(err);
        await updateCameraCaptureState(camara, {
          estado: "error",
          ultimoIntento: now.toISOString(),
          ultimoError: message,
          proximoIntento: minutesFromNowIso(retryMinutes),
        });
        results.push({ serialCamara: camara.serialCamara, status: "error", message });
        console.error(`No se pudo capturar Hik-Connect programada ${camara.serialCamara}:`, err);
      }
    }

    return results;
  } finally {
    scheduledCaptureRunning = false;
  }
}

function startHttp() {
  ensureDir(FTP_DATA_DIR);
  const app = express();

  app.get("/", (_req: Request, res: Response) => {
    res.status(200).json({
      service: "chaman-time-lapse-ftp",
      status: "ok",
      ftp: {
        host: FTP_PASV_URL,
        port: FTP_PUBLIC_PORT,
        passiveMin: FTP_PASV_MIN,
        passiveMax: FTP_PASV_MAX,
      },
    });
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).send("ok");
  });

  app.get("/ftp-info", (_req: Request, res: Response) => {
    res.status(200).json({
      host: FTP_PASV_URL,
      port: FTP_PUBLIC_PORT,
      username: FTP_ANONYMOUS ? "anonymous" : FTP_SHARED_USERNAME,
      password: FTP_ANONYMOUS
        ? "anonymous"
        : FTP_CAMERA_PASSWORD
          ? "configurada-por-variable"
          : "sin-password-configurado",
      cameraId: "usar Custom Prefix igual al serialCamara del lote",
      passive: {
        min: FTP_PASV_MIN,
        max: FTP_PASV_MAX,
      },
      activeBehindProxy: FTP_ALLOW_ACTIVE_BEHIND_PROXY,
      uploadsPath: "/imagenes/{serial}/{yyyy-mm-dd}/{archivo}",
      hikConnectScheduler: {
        enabled: HIKCONNECT_ENABLED,
        everyMinutes: HIKCONNECT_SCHEDULER_INTERVAL_MINUTES,
      },
    });
  });

  app.get("/uploads/latest", (_req: Request, res: Response) => {
    res.status(200).json({ datos: recentUploads, totalCount: recentUploads.length });
  });

  app.get("/hik-connect/status", (_req: Request, res: Response) => {
    res.status(200).json(hikConnect.status());
  });

  app.post("/hik-connect/token/refresh", requireAdminToken, async (_req: Request, res: Response) => {
    try {
      const token = await hikConnect.getToken(true);
      res.status(200).json({
        ok: true,
        tokenCached: true,
        tokenExpiresAt: tokenExpiresAtIso(token.expireTime),
        areaDomain: token.areaDomain || null,
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, message: err?.message || String(err) });
    }
  });

  app.get("/hik-connect/cameras", requireAdminToken, async (_req: Request, res: Response) => {
    try {
      const data = await hikConnect.listCameras();
      res.status(200).json(data);
    } catch (err: any) {
      res.status(500).json({ ok: false, message: err?.message || String(err) });
    }
  });

  app.post("/hik-connect/capture/:serial", requireAdminToken, async (req: Request, res: Response) => {
    try {
      const channelNo = Number(req.query.channelNo || HIKCONNECT_DEFAULT_CHANNEL);
      const record = await ingestHikConnectCapture(req.params.serial, channelNo);
      res.status(201).json(record);
    } catch (err: any) {
      res.status(500).json({ ok: false, message: err?.message || String(err) });
    }
  });

  app.post("/hik-connect/capture-linked", requireAdminToken, async (_req: Request, res: Response) => {
    try {
      const results = await captureLinkedHikConnectCameras();
      res.status(200).json({ datos: results, totalCount: results.length });
    } catch (err: any) {
      res.status(500).json({ ok: false, message: err?.message || String(err) });
    }
  });

  app.post("/hik-connect/capture-scheduled", requireAdminToken, async (_req: Request, res: Response) => {
    try {
      const results = await captureScheduledHikConnectCameras("manual");
      res.status(200).json({ datos: results, totalCount: results.length });
    } catch (err: any) {
      res.status(500).json({ ok: false, message: err?.message || String(err) });
    }
  });

  app.post(
    '/field-photos/upload/:idLote',
    requireAdminToken,
    express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '12mb' }),
    (req: Request, res: Response) => {
      try {
        const originalName = decodeURIComponent(
          String(req.get('x-original-name') || 'foto-campo.jpg'),
        );
        const contentType = String(req.get('content-type') || 'image/jpeg').split(';')[0];
        const record = ingestFieldPhoto(
          req.params.idLote,
          originalName,
          contentType,
          req.body as Buffer,
        );
        res.status(201).json(record);
      } catch (err: any) {
        const message = err?.type === 'entity.too.large'
          ? 'La imagen supera el limite de 12 MB.'
          : err?.message || String(err);
        res.status(400).json({ ok: false, message });
      }
    },
  );

  app.post(
    '/field-audio/upload/:idLote',
    requireAdminToken,
    express.raw({
      type: [
        'audio/webm',
        'audio/ogg',
        'audio/mpeg',
        'audio/mp3',
        'audio/mp4',
        'audio/m4a',
        'audio/x-m4a',
        'audio/wav',
        'audio/wave',
        'audio/x-wav',
      ],
      limit: '25mb',
    }),
    (req: Request, res: Response) => {
      try {
        const originalName = decodeURIComponent(
          String(req.get('x-original-name') || 'audio-campo.webm'),
        );
        const contentType = String(req.get('content-type') || 'audio/webm').split(';')[0];
        res.status(201).json(
          ingestFieldAudio(
            req.params.idLote,
            originalName,
            contentType,
            req.body as Buffer,
          ),
        );
      } catch (err: any) {
        const message = err?.type === 'entity.too.large'
          ? 'El audio supera el limite de 25 MB.'
          : err?.message || String(err);
        res.status(400).json({ ok: false, message });
      }
    },
  );

  app.use(
    "/imagenes",
    privateFieldPhotoAccess(TIMELAPSE_ADMIN_TOKEN),
    express.static(FTP_DATA_DIR, {
      immutable: true,
      maxAge: "30d",
    }),
  );

  app.use(
    '/audios',
    privateFieldAudioAccess(TIMELAPSE_ADMIN_TOKEN),
    express.static(FTP_DATA_DIR, {
      immutable: true,
      maxAge: '30d',
    }),
  );

  const httpPorts = Array.from(new Set([HTTP_PORT, HTTP_PUBLIC_PORT].filter(Boolean)));
  httpPorts.forEach((port) => {
    app.listen(port, () => {
      console.log(`HTTP time-lapse escuchando en puerto ${port}`);
    });
  });
}

function startFtp() {
  ensureDir(FTP_DATA_DIR);

  const options: FtpServerOptions = {
    anonymous: FTP_ANONYMOUS,
    greeting: "CHAMAN Agro Time-lapse FTP",
    url: `ftp://${FTP_HOST}:${FTP_PORT}`,
    pasv_url: FTP_PASV_URL,
    pasv_min: FTP_PASV_MIN,
    pasv_max: FTP_PASV_MAX,
    tls: false,
  };

  const ftpServer = new FtpSrv(options);

  ftpServer.on("login", ({ connection, username, password }, resolve, reject) => {
    const cameraUser = sanitizeSegment(username);
    const normalizedUser = cameraUser.toLowerCase();
    const sharedUser = sanitizeSegment(FTP_SHARED_USERNAME).toLowerCase();
    const isAnonymousLogin = normalizedUser === "anonymous";
    const isSharedLogin = normalizedUser === sharedUser;
    const validUsername = FTP_ANONYMOUS || isSharedLogin || (!!cameraUser && !isAnonymousLogin);
    const validPassword = FTP_ANONYMOUS || !FTP_CAMERA_PASSWORD || password === FTP_CAMERA_PASSWORD;

    if (!validUsername || !validPassword) {
      reject(new Error("Credenciales FTP invalidas"));
      return;
    }

    const root = path.join(FTP_DATA_DIR, "_incoming", cameraUser);
    ensureDir(root);
    console.log(`Camara conectada por FTP: ${cameraUser}`);
    resolve({ root, fs: new AutoCreateFileSystem(connection, { root }) as any });

    connection.on("STOR", (error, fileName) => {
      if (error) {
        console.error("Error recibiendo archivo FTP:", error);
        return;
      }

      setTimeout(() => {
        ingestUpload(cameraUser, fileName).catch((err) => {
          console.error("Error procesando imagen FTP:", err);
        });
      }, 250);
    });
  });

  ftpServer
    .listen()
    .then(() => console.log(`FTP time-lapse escuchando en ${FTP_URL}`))
    .catch((err) => {
      console.error("Error al iniciar el servidor FTP:", err);
      process.exit(1);
    });
}

startHttp();
startFtp();

if (HIKCONNECT_ENABLED) {
  if (HIKCONNECT_CAPTURE_ON_START) {
    captureScheduledHikConnectCameras("startup").catch((err) => {
      console.error("Error en captura inicial Hik-Connect:", err);
    });
  }

  if (HIKCONNECT_SCHEDULER_INTERVAL_MINUTES > 0) {
    const intervalMs = HIKCONNECT_SCHEDULER_INTERVAL_MINUTES * 60 * 1000;
    setInterval(() => {
      captureScheduledHikConnectCameras("interval").catch((err) => {
        console.error("Error en captura programada Hik-Connect:", err);
      });
    }, intervalMs);
  }
}
