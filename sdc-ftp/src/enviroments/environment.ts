const railwayPublicDomain = process.env.RAILWAY_PUBLIC_DOMAIN || "";

export const HTTP_PORT = Number(process.env.HTTP_PORT || process.env.PORT || 5000);
export const HTTP_PUBLIC_PORT = Number(process.env.HTTP_PUBLIC_PORT || 0);
export const FTP_PORT = Number(process.env.FTP_PORT || process.env.RAILWAY_TCP_APPLICATION_PORT || 2121);
export const FTP_HOST = process.env.FTP_HOST || "0.0.0.0";
export const FTP_PUBLIC_HOST =
  process.env.FTP_PUBLIC_HOST || process.env.RAILWAY_TCP_PROXY_DOMAIN || process.env.FTP_PASV_URL || "";
export const FTP_PUBLIC_PORT = Number(process.env.FTP_PUBLIC_PORT || process.env.RAILWAY_TCP_PROXY_PORT || FTP_PORT);
export const FTP_URL = process.env.FTP_URL || `ftp://${FTP_HOST}:${FTP_PORT}`;
export const FTP_PASV_URL = FTP_PUBLIC_HOST || "127.0.0.1";
export const FTP_PASV_MIN = Number(process.env.FTP_PASV_MIN || 30000);
export const FTP_PASV_MAX = Number(process.env.FTP_PASV_MAX || 30010);
export const FTP_ANONYMOUS = process.env.FTP_ANONYMOUS === "true";
export const FTP_ALLOW_ACTIVE_BEHIND_PROXY = process.env.FTP_ALLOW_ACTIVE_BEHIND_PROXY === "true";
export const FTP_SHARED_USERNAME = process.env.FTP_SHARED_USERNAME || "chaman";
export const FTP_CAMERA_PASSWORD = process.env.FTP_CAMERA_PASSWORD || "";
export const FTP_DATA_DIR = process.env.FTP_DATA_DIR || "/data/chaman-timelapse";
export const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || (railwayPublicDomain ? `https://${railwayPublicDomain}` : "");
export const API_DATOS = process.env.API_DATOS || "http://localhost:5001";
export const TIMELAPSE_ADMIN_TOKEN = process.env.TIMELAPSE_ADMIN_TOKEN || "";

export const HIKCONNECT_ENABLED = process.env.HIKCONNECT_ENABLED === "true";
export const HIKCONNECT_SERVER_URL = process.env.HIKCONNECT_SERVER_URL || "";
export const HIKCONNECT_APP_KEY = process.env.HIKCONNECT_APP_KEY || "";
export const HIKCONNECT_SECRET_KEY = process.env.HIKCONNECT_SECRET_KEY || "";
export const HIKCONNECT_ENCRYPTION_KEY = process.env.HIKCONNECT_ENCRYPTION_KEY || "";
export const HIKCONNECT_DEFAULT_CHANNEL = Number(process.env.HIKCONNECT_DEFAULT_CHANNEL || 1);
export const HIKCONNECT_CAPTURE_ON_START = process.env.HIKCONNECT_CAPTURE_ON_START === "true";
export const HIKCONNECT_CAPTURE_INTERVAL_MINUTES = Number(process.env.HIKCONNECT_CAPTURE_INTERVAL_MINUTES || 0);
const hikConnectSchedulerInterval = Number(
  process.env.HIKCONNECT_SCHEDULER_INTERVAL_MINUTES ||
    process.env.HIKCONNECT_CAPTURE_INTERVAL_MINUTES ||
    10,
);
export const HIKCONNECT_SCHEDULER_INTERVAL_MINUTES =
  hikConnectSchedulerInterval > 0 ? hikConnectSchedulerInterval : 10;
