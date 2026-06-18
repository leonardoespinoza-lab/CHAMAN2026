import {
  HIKCONNECT_APP_KEY,
  HIKCONNECT_DEFAULT_CHANNEL,
  HIKCONNECT_ENABLED,
  HIKCONNECT_SECRET_KEY,
  HIKCONNECT_SERVER_URL,
} from "./enviroments/environment";

const fetchFn = (globalThis as any).fetch as (input: string, init?: any) => Promise<any>;

export type HikConnectToken = {
  accessToken: string;
  expireTime: number;
  userId?: string;
  areaDomain?: string;
};

export type HikConnectCamera = {
  id?: string;
  name?: string;
  online?: string;
  area?: { id?: string; name?: string };
  device?: {
    devInfo?: {
      id?: string;
      category?: string;
      serialNo?: string;
      streamSecretKey?: string;
    };
    channelInfo?: {
      id?: string;
      no?: string | number;
    };
  };
};

export type HikConnectCaptureResult = {
  captureUrl: string;
  isEncrypted: number;
};

function trimSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function resolveBaseUrl(serverUrl?: string) {
  const base = serverUrl || HIKCONNECT_SERVER_URL;
  if (!base) return "";
  if (/^https?:\/\//i.test(base)) return trimSlash(base);
  return `https://${trimSlash(base)}`;
}

function secondsToMs(value: number) {
  return value > 10_000_000_000 ? value : value * 1000;
}

function assertConfigured() {
  if (!HIKCONNECT_ENABLED) {
    throw new Error("Hik-Connect no esta habilitado. Definir HIKCONNECT_ENABLED=true.");
  }
  if (!resolveBaseUrl()) {
    throw new Error("Falta HIKCONNECT_SERVER_URL.");
  }
  if (!HIKCONNECT_APP_KEY || !HIKCONNECT_SECRET_KEY) {
    throw new Error("Faltan HIKCONNECT_APP_KEY o HIKCONNECT_SECRET_KEY.");
  }
}

export class HikConnectClient {
  private cachedToken?: HikConnectToken;

  isConfigured() {
    return Boolean(HIKCONNECT_ENABLED && resolveBaseUrl() && HIKCONNECT_APP_KEY && HIKCONNECT_SECRET_KEY);
  }

  status() {
    const expiresAt = this.cachedToken?.expireTime ? new Date(secondsToMs(this.cachedToken.expireTime)).toISOString() : null;
    return {
      enabled: HIKCONNECT_ENABLED,
      configured: this.isConfigured(),
      serverUrl: resolveBaseUrl() || null,
      defaultChannel: HIKCONNECT_DEFAULT_CHANNEL,
      tokenCached: Boolean(this.cachedToken?.accessToken),
      tokenExpiresAt: expiresAt,
      areaDomain: this.cachedToken?.areaDomain || null,
    };
  }

  private apiBase() {
    return trimSlash(this.cachedToken?.areaDomain || resolveBaseUrl());
  }

  private async request<T>(uri: string, init: any = {}, useToken = true): Promise<T> {
    assertConfigured();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    };

    if (useToken) {
      const token = await this.getToken();
      headers.Token = token.accessToken;
    }

    const response = await fetchFn(`${this.apiBase()}${uri}`, {
      ...init,
      headers,
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok || payload?.errorCode !== "0") {
      throw new Error(`Hik-Connect rechazo ${uri}: HTTP ${response.status} ${payload?.errorCode || ""} ${payload?.message || text}`);
    }

    return payload;
  }

  async getToken(force = false): Promise<HikConnectToken> {
    assertConfigured();
    const now = Date.now();
    const cachedExpiry = this.cachedToken?.expireTime ? secondsToMs(this.cachedToken.expireTime) : 0;
    if (!force && this.cachedToken?.accessToken && cachedExpiry - now > 6 * 60 * 60 * 1000) {
      return this.cachedToken;
    }

    const response = await fetchFn(`${resolveBaseUrl()}/api/hccgw/platform/v1/token/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appKey: HIKCONNECT_APP_KEY,
        secretKey: HIKCONNECT_SECRET_KEY,
      }),
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok || payload?.errorCode !== "0") {
      throw new Error(`Hik-Connect no entrego token: HTTP ${response.status} ${payload?.errorCode || ""} ${payload?.message || text}`);
    }

    this.cachedToken = payload.data as HikConnectToken;
    return this.cachedToken;
  }

  async listCameras(filter: Record<string, unknown> = {}) {
    const payload = await this.request<{ data: { total?: number; totalCount?: number; pageIndex?: number; pageSize?: number; list?: HikConnectCamera[]; camera?: HikConnectCamera[] } }>(
      "/api/hccgw/resource/v1/areas/cameras/get",
      {
        method: "POST",
        body: JSON.stringify({
          pageIndex: 1,
          pageSize: 500,
          filter: {
            areaID: "-1",
            includeSubArea: "1",
            ...filter,
          },
        }),
      },
    );

    const data = payload.data || {};
    return {
      total: data.totalCount || data.total || (data.list || data.camera || []).length,
      cameras: data.list || data.camera || [],
    };
  }

  async capturePicture(deviceSerial: string, channelNo = HIKCONNECT_DEFAULT_CHANNEL): Promise<HikConnectCaptureResult> {
    const payload = await this.request<{ data: HikConnectCaptureResult }>(
      "/api/hccgw/resource/v1/device/capturePic",
      {
        method: "POST",
        body: JSON.stringify({
          deviceSerial,
          channelNo,
        }),
      },
    );

    if (!payload.data?.captureUrl) {
      throw new Error("Hik-Connect no devolvio captureUrl.");
    }

    return payload.data;
  }

  async downloadCapture(captureUrl: string) {
    const response = await fetchFn(captureUrl);
    if (!response.ok) {
      throw new Error(`No se pudo descargar captureUrl: HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const bytes = Buffer.from(await response.arrayBuffer());
    return { bytes, contentType };
  }
}
