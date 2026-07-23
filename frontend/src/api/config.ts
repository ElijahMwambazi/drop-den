import { getJson, patchJson } from "./client";
import type { AppConfig, HostSettings } from "../types";

export function getConfig(_deviceId?: string) {
  return getJson<AppConfig>("/api/config");
}

export function updateHostSettings(settings: HostSettings) {
  return patchJson<HostSettings, HostSettings>("/api/host/settings", settings);
}
