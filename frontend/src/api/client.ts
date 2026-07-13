import { useDeviceStore } from "../store/deviceStore";

const DESKTOP_API_ORIGIN = "http://127.0.0.1:18080";

export const DEVICE_ID_HEADER = "X-Drop-Den-Device-Id";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

export function isTauriRuntime() {
  return (
    window.location.protocol === "tauri:" ||
    "__TAURI_INTERNALS__" in (window as TauriWindow)
  );
}

export function apiUrl(path: string) {
  if (isTauriRuntime()) {
    return `${DESKTOP_API_ORIGIN}${path}`;
  }

  return path;
}

export function websocketUrl(path = "/ws") {
  if (isTauriRuntime()) {
    return `ws://127.0.0.1:18080${path}`;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
}

function getDeviceId() {
  return useDeviceStore.getState().device?.id;
}

function authorizedHeaders(headers: HeadersInit = {}) {
  const deviceId = getDeviceId();

  return {
    ...headers,
    ...(deviceId ? { [DEVICE_ID_HEADER]: deviceId } : {}),
  };
}

export function currentDeviceQuery() {
  const deviceId = getDeviceId();

  if (!deviceId) {
    return "";
  }

  return `device_id=${encodeURIComponent(deviceId)}`;
}

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path), {
    headers: authorizedHeaders(),
  });

  if (!response.ok) {
    throw new ApiError(`GET ${path} failed: ${response.status}`, response.status);
  }

  return response.json();
}

export async function postJson<TResponse, TBody>(
  path: string,
  body: TBody,
): Promise<TResponse> {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: authorizedHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new ApiError(`POST ${path} failed: ${response.status}`, response.status);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return response.json();
}

export async function patchJson<TResponse, TBody = undefined>(
  path: string,
  body?: TBody,
): Promise<TResponse> {
  const response = await fetch(apiUrl(path), {
    method: "PATCH",
    headers: authorizedHeaders(
      body === undefined ? {} : { "Content-Type": "application/json" },
    ),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new ApiError(`PATCH ${path} failed: ${response.status}`, response.status);
  }

  return response.json();
}

export async function deleteRequest(path: string): Promise<void> {
  const response = await fetch(apiUrl(path), {
    method: "DELETE",
    headers: authorizedHeaders(),
  });

  if (!response.ok && response.status !== 204) {
    throw new ApiError(`DELETE ${path} failed: ${response.status}`, response.status);
  }
}
