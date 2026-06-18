import express, { Request, Response } from "express";
import FtpSrv, { FtpServerOptions } from "ftp-srv";
import fs from "fs";
import path from "path";
import {
  API_DATOS,
  FTP_ANONYMOUS,
  FTP_CAMERA_PASSWORD,
  FTP_DATA_DIR,
  FTP_HOST,
  FTP_PASV_MAX,
  FTP_PASV_MIN,
  FTP_PASV_URL,
  FTP_PUBLIC_PORT,
  FTP_PORT,
  FTP_URL,
  HTTP_PORT,
  PUBLIC_BASE_URL,
} from "./enviroments/environment";
import { IFoto, IListado, ILote } from "modelos";

type UploadRecord = {
  serialCamara: string;
  originalName: string;
  storedName: string;
  relativePath: string;
  publicUrl: string;
  size: number;
  fechaCaptura: string;
  idLote?: string;
  loteNombre?: string;
  status: "linked" | "pending";
};

const recentUploads: UploadRecord[] = [];
const fetchFn = (globalThis as any).fetch as (input: string, init?: any) => Promise<any>;

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

function serialFromLoginOrFile(username: string, fileName: string) {
  if (username && username.toLowerCase() !== "anonymous") {
    return sanitizeSegment(username).toUpperCase();
  }

  const base = path.basename(fileName);
  const prefix = base.split(/[_\-\s]/)[0];
  return sanitizeSegment(prefix).toUpperCase();
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
      username: "usar-numero-de-serie-de-camara",
      password: FTP_CAMERA_PASSWORD ? "configurada-por-variable" : "sin-password-configurado",
      passive: {
        min: FTP_PASV_MIN,
        max: FTP_PASV_MAX,
      },
      uploadsPath: "/imagenes/{serial}/{yyyy-mm-dd}/{archivo}",
    });
  });

  app.get("/uploads/latest", (_req: Request, res: Response) => {
    res.status(200).json({ datos: recentUploads, totalCount: recentUploads.length });
  });

  app.use("/imagenes", express.static(FTP_DATA_DIR, {
    immutable: true,
    maxAge: "30d",
  }));

  app.listen(HTTP_PORT, () => {
    console.log(`HTTP time-lapse escuchando en puerto ${HTTP_PORT}`);
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
    const validPassword = FTP_ANONYMOUS || !FTP_CAMERA_PASSWORD || password === FTP_CAMERA_PASSWORD;

    if (!validPassword) {
      reject(new Error("Credenciales FTP invalidas"));
      return;
    }

    const root = path.join(FTP_DATA_DIR, "_incoming", cameraUser);
    ensureDir(root);
    console.log(`Camara conectada por FTP: ${cameraUser}`);
    resolve({ root });

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
