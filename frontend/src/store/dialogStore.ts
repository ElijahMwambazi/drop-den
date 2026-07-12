import { create } from "zustand";

export type DialogOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  verificationText?: string;
};

type ActiveDialog = DialogOptions & {
  resolve: (confirmed: boolean) => void;
};

type DialogState = {
  dialog: ActiveDialog | null;
  confirm: (options: DialogOptions) => Promise<boolean>;
  resolve: (confirmed: boolean) => void;
};

export const useDialogStore = create<DialogState>((set, get) => ({
  dialog: null,
  confirm: (options) =>
    new Promise<boolean>((resolve) => {
      set({ dialog: { ...options, resolve } });
    }),
  resolve: (confirmed) => {
    const dialog = get().dialog;
    if (!dialog) return;

    set({ dialog: null });
    dialog.resolve(confirmed);
  },
}));
