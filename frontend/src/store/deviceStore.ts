import { create } from "zustand";
import type { Device } from "../types";

const DEVICE_STORAGE_KEY = "drop-den-device";

type DeviceState = {
  device: Device | null;
  setDevice: (device: Device) => void;
  clearDevice: () => void;
  hydrateDevice: () => void;
};

function readStoredDevice() {
  const storedValue = localStorage.getItem(DEVICE_STORAGE_KEY);

  if (!storedValue) {
    return null;
  }

  try {
    return JSON.parse(storedValue) as Device;
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
