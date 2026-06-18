const railwayPublicDomain = process.env.RAILWAY_PUBLIC_DOMAIN || "";

export const HTTP_PORT = Number(process.env.HTTP_PORT || process.env.PORT || 5000);
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
export const FTP_CAMERA_PASSWORD = process.env.FTP_CAMERA_PASSWORD || "";
export const FTP_DATA_DIR = process.env.FTP_DATA_DIR || "/data/chaman-timelapse";
export const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || (railwayPublicDomain ? `https://${railwayPublicDomain}` : "");
export const API_DATOS = process.env.API_DATOS || "http://localhost:5001";
