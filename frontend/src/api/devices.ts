import { deleteRequest, getJson, postJson } from "./client";
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

export function removeDevice(deviceId: string) {
  return deleteRequest(`/api/devices/${deviceId}`);
}

const VOLUNTARY_LEAVE_KEY = "drop-den-voluntary-leave";

export async function leaveDevice(deviceId: string) {
  sessionStorage.setItem(VOLUNTARY_LEAVE_KEY, deviceId);

  try {
    await removeDevice(deviceId);
  } catch (error) {
    sessionStorage.removeItem(VOLUNTARY_LEAVE_KEY);
    throw error;
  }
}

export function consumeVoluntaryLeave(deviceId: string) {
  if (sessionStorage.getItem(VOLUNTARY_LEAVE_KEY) !== deviceId) {
    return false;
  }

  sessionStorage.removeItem(VOLUNTARY_LEAVE_KEY);
  return true;
}

export function resetHostIdentity() {
  return postJson<void, Record<string, never>>("/api/host/reset", {});
}

export function resetDesktopData() {
  return postJson<void, Record<string, never>>("/api/desktop/reset-all", {});
}
