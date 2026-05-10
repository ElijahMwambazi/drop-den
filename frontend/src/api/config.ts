import { getJson } from "./client";
import type { AppConfig } from "../types";

export function getConfig(deviceId?: string) {
  const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : "";

  return getJson<AppConfig>(`/api/config${query}`);
}
