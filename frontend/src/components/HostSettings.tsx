import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MessageSquareX, RotateCcw, Shield, Trash2 } from "lucide-react";
import { resetHostIdentity } from "../api/devices";
import { clearMessages } from "../api/messages";
import { deleteAllTransfers } from "../api/transfers";
import { useDeviceStore } from "../store/deviceStore";
import { useDialogStore } from "../store/dialogStore";
import { useToastStore } from "../store/toastStore";
import { Card } from "./Card";

type HostSettingsProps = {
  embedded?: boolean;
};

export function HostSettings({ embedded = false }: HostSettingsProps) {
  const [isClearingTransfers, setIsClearingTransfers] = useState(false);
  const queryClient = useQueryClient();
  const clearDevice = useDeviceStore((state) => state.clearDevice);
  const confirm = useDialogStore((state) => state.confirm);
  const addToast = useToastStore((state) => state.addToast);

  async function clearAllMessages() {
    if (
      !(await confirm({
        title: "Clear all messages?",
        description: "Every local message in this den will be deleted.",
        confirmLabel: "Clear messages",
        tone: "danger",
      }))
    ) {
      return;
    }

    try {
      await clearMessages();
      await queryClient.invalidateQueries({ queryKey: ["messages"] });
      addToast({ type: "success", message: "Messages cleared." });
    } catch {
      addToast({ type: "error", message: "Could not clear messages." });
    }
  }

  async function clearAllTransfers() {
    if (
      !(await confirm({
        title: "Clear every transfer?",
        description:
          "Every transfer and its stored file will be permanently deleted. This cannot be undone.",
        confirmLabel: "Clear transfers",
        tone: "danger",
      }))
    ) {
      return;
    }

    setIsClearingTransfers(true);
    try {
      await deleteAllTransfers();
      await queryClient.invalidateQueries({ queryKey: ["transfers"] });
      addToast({ type: "success", message: "All transfers cleared." });
    } catch {
      addToast({ type: "error", message: "Could not clear transfers." });
    } finally {
      setIsClearingTransfers(false);
    }
  }

  async function resetHost() {
    if (
      !(await confirm({
        title: "Reset host identity?",
        description:
          "This device will leave the den. The next device registered from any supported runtime becomes host.",
        confirmLabel: "Reset host",
        tone: "danger",
      }))
    ) {
      return;
    }

    try {
      await resetHostIdentity();
      clearDevice();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["config"] }),
        queryClient.invalidateQueries({ queryKey: ["devices"] }),
        queryClient.invalidateQueries({ queryKey: ["transfers"] }),
        queryClient.invalidateQueries({ queryKey: ["messages"] }),
      ]);
      addToast({ type: "success", message: "Host identity reset." });
    } catch {
      addToast({ type: "error", message: "Could not reset the host identity." });
    }
  }

  const content = (
    <>
      {!embedded && (
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Host settings</h2>
            <p className="mt-1 text-xs leading-5 text-neutral-600">
              Manage den-wide content and host identity.
            </p>
          </div>
          <div className="rounded-xl bg-neutral-100 p-2 text-neutral-700">
            <Shield size={16} />
          </div>
        </div>
      )}

      <div className={embedded ? "grid gap-2" : "mt-3 grid gap-2 sm:grid-cols-2"}>
        <HostAction onClick={clearAllMessages} tone="warning">
          <MessageSquareX size={14} /> Clear messages
        </HostAction>
        <HostAction
          onClick={clearAllTransfers}
          tone="warning"
          disabled={isClearingTransfers}
        >
          <Trash2 size={14} />
          {isClearingTransfers ? "Clearing…" : "Clear transfers"}
        </HostAction>
        <HostAction onClick={resetHost} tone="danger" wide={!embedded}>
          <RotateCcw size={14} /> Reset host identity
        </HostAction>
      </div>

      <p className="mt-3 text-[11px] leading-4 text-neutral-500">
        Host controls follow the host role and are available in desktop and browser runtimes.
      </p>
    </>
  );

  if (embedded) return content;
  return <Card>{content}</Card>;
}

function HostAction({
  children,
  onClick,
  tone,
  disabled = false,
  wide = false,
}: {
  children: ReactNode;
  onClick: () => void | Promise<void>;
  tone: "warning" | "danger";
  disabled?: boolean;
  wide?: boolean;
}) {
  const colorClass =
    tone === "danger"
      ? "border-red-200 text-red-700 hover:bg-red-50"
      : "border-amber-200 text-amber-800 hover:bg-amber-50";

  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium disabled:opacity-50 ${colorClass} ${
        wide ? "sm:col-span-2" : ""
      }`}
      type="button"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
