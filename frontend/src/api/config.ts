import { getJson } from "./client";
import type { AppConfig } from "../types";

export function getConfig() {
  return getJson<AppConfig>("/api/config");
}
