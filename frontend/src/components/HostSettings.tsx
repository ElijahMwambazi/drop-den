import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, MessageSquareX, RotateCcw, Save, Shield, Trash2 } from "lucide-react";
import { getConfig, updateHostSettings } from "../api/config";
import { resetHostIdentity } from "../api/devices";
import { clearMessages } from "../api/messages";
import { deleteAllTransfers } from "../api/transfers";
import { useDeviceStore } from "../store/deviceStore";
import { useDialogStore } from "../store/dialogStore";
import { useToastStore } from "../store/toastStore";
import { Card } from "./Card";
import { SelectMenu } from "./SelectMenu";

type HostSettingsProps = {
  embedded?: boolean;
};

export function HostSettings({ embedded = false }: HostSettingsProps) {
  const [isClearingTransfers, setIsClearingTransfers] = useState(false);
  const [isSavingExpiry, setIsSavingExpiry] = useState(false);
  const [transferTtlSeconds, setTransferTtlSeconds] = useState("86400");
  const queryClient = useQueryClient();
  const device = useDeviceStore((state) => state.device);
  const clearDevice = useDeviceStore((state) => state.clearDevice);
  const confirm = useDialogStore((state) => state.confirm);
  const addToast = useToastStore((state) => state.addToast);

  const { data: config } = useQuery({
    queryKey: ["config", device?.id],
    queryFn: () => getConfig(device?.id),
    enabled: Boolean(device?.id),
  });

  useEffect(() => {
    if (config?.default_transfer_ttl_seconds) {
      setTransferTtlSeconds(String(config.default_transfer_ttl_seconds));
    }
  }, [config?.default_transfer_ttl_seconds]);

  async function saveTransferExpiry() {
    setIsSavingExpiry(true);
    try {
      await updateHostSettings({
        transfer_ttl_seconds: Number(transferTtlSeconds),
      });
      await queryClient.invalidateQueries({ queryKey: ["config"] });
      addToast({
        type: "success",
        message: `New transfers will expire after ${transferTtlLabel(transferTtlSeconds)}.`,
      });
    } catch {
      addToast({ type: "error", message: "Could not update transfer expiry." });
    } finally {
      setIsSavingExpiry(false);
    }
  }

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

      <div className={embedded ? "mt-1" : "mt-3"}>
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
          <div className="flex items-start gap-2.5">
            <div className="rounded-xl bg-white p-2 text-neutral-600 shadow-sm">
              <Clock3 size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-neutral-900">Transfer lifetime</p>
              <p className="mt-0.5 text-[11px] leading-4 text-neutral-500">
                Applies to new uploads. Existing transfers keep their current expiry.
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <SelectMenu
              value={transferTtlSeconds}
              onChange={setTransferTtlSeconds}
              ariaLabel="Default transfer lifetime"
              options={TRANSFER_TTL_OPTIONS}
            />
            <button
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-neutral-950 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
              onClick={saveTransferExpiry}
              disabled={
                isSavingExpiry ||
                Number(transferTtlSeconds) === config?.default_transfer_ttl_seconds
              }
            >
              <Save size={13} /> {isSavingExpiry ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      <div className={embedded ? "mt-3 grid gap-2" : "mt-3 grid gap-2 sm:grid-cols-2"}>
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

const TRANSFER_TTL_OPTIONS = [
  { value: "3600", label: "1 hour" },
  { value: "21600", label: "6 hours" },
  { value: "43200", label: "12 hours" },
  { value: "86400", label: "1 day" },
  { value: "259200", label: "3 days" },
  { value: "604800", label: "7 days" },
  { value: "2592000", label: "30 days" },
];

function transferTtlLabel(value: string) {
  return (
    TRANSFER_TTL_OPTIONS.find((option) => option.value === value)?.label ??
    "the selected time"
  );
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
