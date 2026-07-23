import { create } from "zustand";
import type { DeviceSession } from "../types";

const DEVICE_STORAGE_KEY = "drop-den-device";

type DeviceState = {
  device: DeviceSession | null;
  setDevice: (device: DeviceSession) => void;
  clearDevice: () => void;
  hydrateDevice: () => void;
};

function readStoredDevice() {
  const storedValue = localStorage.getItem(DEVICE_STORAGE_KEY);

  if (!storedValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(storedValue) as Partial<DeviceSession>;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.name !== "string" ||
      typeof parsed.connected_at !== "string" ||
      typeof parsed.session_token !== "string" ||
      parsed.session_token.length < 32
    ) {
      localStorage.removeItem(DEVICE_STORAGE_KEY);
      return null;
    }
    return parsed as DeviceSession;
  } catch {
    localStorage.removeItem(DEVICE_STORAGE_KEY);
    return null;
  }
}

export const useDeviceStore = create<DeviceState>((set) => ({
  device: readStoredDevice(),

  setDevice: (device) => {
    localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(device));
    localStorage.setItem("drop-den-device-name", device.name);
    set({ device });
  },

  clearDevice: () => {
    localStorage.removeItem(DEVICE_STORAGE_KEY);
    localStorage.removeItem("drop-den-device-name");
    set({ device: null });
  },

  hydrateDevice: () => {
    set({ device: readStoredDevice() });
  },
}));
