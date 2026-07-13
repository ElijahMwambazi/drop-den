import { create } from "zustand";

export type ToastType = "success" | "error" | "info";

export type Toast = {
  id: string;
  type: ToastType;
  message: string;
  count: number;
  updatedAt: number;
};

type ToastState = {
  toasts: Toast[];
  addToast: (toast: Pick<Toast, "type" | "message">) => void;
  removeToast: (id: string) => void;
};

const DEDUPE_WINDOW_MS = 2000;
const MAX_STORED_TOASTS = 8;
const toastTimers = new Map<string, number>();

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (toast) => {
    const now = Date.now();
    let toastId = "";

    set((state) => {
      const duplicate = [...state.toasts]
        .reverse()
        .find(
          (currentToast) =>
            currentToast.type === toast.type &&
            currentToast.message === toast.message &&
            now - currentToast.updatedAt <= DEDUPE_WINDOW_MS,
        );

      if (duplicate) {
        toastId = duplicate.id;
        const updatedToast = {
          ...duplicate,
          count: duplicate.count + 1,
          updatedAt: now,
        };

        return {
          toasts: [
            ...state.toasts.filter((currentToast) => currentToast.id !== duplicate.id),
            updatedToast,
          ],
        };
      }

      toastId = createToastId();
      return {
        toasts: [
          ...state.toasts,
          { ...toast, id: toastId, count: 1, updatedAt: now },
        ].slice(-MAX_STORED_TOASTS),
      };
    });

    const existingTimer = toastTimers.get(toastId);
    if (existingTimer) window.clearTimeout(existingTimer);

    const duration = toast.type === "error" ? 6000 : 3500;
    const timer = window.setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((currentToast) => currentToast.id !== toastId),
      }));
      toastTimers.delete(toastId);
    }, duration);

    toastTimers.set(toastId, timer);
  },

  removeToast: (id) => {
    const timer = toastTimers.get(id);
    if (timer) window.clearTimeout(timer);
    toastTimers.delete(id);

    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },
}));

function createToastId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
