import { getJson, postJson } from "./client";
import type { Device } from "../types";

export function listDevices() {
  return getJson<Device[]>("/api/devices");
}

export function registerDevice(name: string) {
  return postJson<Device, { name: string }>("/api/devices", { name });
}
