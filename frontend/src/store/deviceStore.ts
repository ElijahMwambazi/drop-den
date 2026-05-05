import { create } from "zustand";
import type { Device } from "../types";

type DeviceState = {
  device: Device | null;
  setDevice: (device: Device) => void;
};

export const useDeviceStore = create<DeviceState>((set) => ({
  device: null,
  setDevice: (device) => set({ device }),
}));
