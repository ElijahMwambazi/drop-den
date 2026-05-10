import { getJson, postJson } from "./client";
import type { Device } from "../types";

type RegisterDeviceInput = {
  name: string;
  joinPin?: string;
};

export function listDevices() {
  return getJson<Device[]>("/api/devices");
}

export function registerDevice(input: RegisterDeviceInput) {
  return postJson<Device, { name: string; join_pin?: string }>("/api/devices", {
    name: input.name,
    join_pin: input.joinPin,
  });
}
