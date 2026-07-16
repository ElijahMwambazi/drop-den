import { getJson, patchJson } from "./client";
import type { AppConfig, HostSettings } from "../types";

export function getConfig(deviceId?: string) {
  const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : "";

  return getJson<AppConfig>(`/api/config${query}`);
}

export function updateHostSettings(settings: HostSettings) {
  return patchJson<HostSettings, HostSettings>("/api/host/settings", settings);
}
