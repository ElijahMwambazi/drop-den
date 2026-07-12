import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  Copy,
  FolderOpen,
  HardDrive,
  MessageSquareX,
  Power,
  RotateCcw,
  Save,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getConfig } from "../api/config";
import { resetDesktopData, resetHostIdentity } from "../api/devices";
import { clearMessages } from "../api/messages";
import { deleteAllTransfers } from "../api/transfers";
import { useDeviceStore } from "../store/deviceStore";
import { useToastStore } from "../store/toastStore";
import { Card } from "./Card";
import { isTauriRuntime } from "../api/client";
import { useDialogStore } from "../store/dialogStore";
import { DesktopDiagnostics } from "./DesktopDiagnostics";

type DesktopSettingsProps = {
  embedded?: boolean;
};

type TransferStoragePreference = {
  configured_dir: string;
  using_fallback: boolean;
};

export function DesktopSettings({ embedded = false }: DesktopSettingsProps) {
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [transferStorageDir, setTransferStorageDir] = useState("");
  const [savedTransferStorageDir, setSavedTransferStorageDir] = useState("");
  const [isSavingStorageDir, setIsSavingStorageDir] = useState(false);
  const [isClearingTransfers, setIsClearingTransfers] = useState(false);
  const [storageFallbackActive, setStorageFallbackActive] = useState(false);

  const queryClient = useQueryClient();
  const device = useDeviceStore((state) => state.device);
  const clearDevice = useDeviceStore((state) => state.clearDevice);
  const addToast = useToastStore((state) => state.addToast);
  const confirm = useDialogStore((state) => state.confirm);

  const {
    data: config,
    dataUpdatedAt: configUpdatedAt,
    isError: configError,
    isFetching: isRefreshingConfig,
    refetch: refreshConfig,
  } = useQuery({
    queryKey: ["config", device?.id],
    queryFn: () => getConfig(device?.id),
    enabled: isTauriRuntime(),
  });

  useEffect(() => {
    if (!isTauriRuntime() || savedTransferStorageDir) return;

    invoke<TransferStoragePreference>("get_transfer_storage_preference")
      .then((preference) => {
        setTransferStorageDir(preference.configured_dir);
        setSavedTransferStorageDir(preference.configured_dir);
        setStorageFallbackActive(preference.using_fallback);
      })
      .catch(() => {
        if (config?.storage_dir) {
          setTransferStorageDir(config.storage_dir);
          setSavedTransferStorageDir(config.storage_dir);
        }
      });
  }, [config?.storage_dir, savedTransferStorageDir]);

  if (!isTauriRuntime()) {
    return null;
  }

  const localUrl = config?.local_origin ?? "http://127.0.0.1:18080";
  const joinUrl = config?.recommended_join_origin ?? localUrl;
  const displayedTransferStorageDir =
    (storageFallbackActive ? config?.storage_dir : savedTransferStorageDir) ||
    config?.storage_dir ||
    "Unavailable";
  const storageChangePendingRestart = Boolean(
    !storageFallbackActive &&
    savedTransferStorageDir &&
      config?.storage_dir &&
      savedTransferStorageDir !== config.storage_dir,
  );
  const storageDirChanged =
    transferStorageDir.trim().length > 0 &&
    transferStorageDir.trim() !== savedTransferStorageDir;

  async function copyValue(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedValue(label);

    addToast({
      type: "success",
      message: `${label} copied.`,
    });

    window.setTimeout(() => {
      setCopiedValue(null);
    }, 1200);
  }

  async function openDesktopFolder(
    label: string,
    command: "open_data_folder" | "open_transfers_folder",
  ) {
    try {
      await invoke(command);

      addToast({
        type: "success",
        message: `${label} opened.`,
      });
    } catch (error) {
      addToast({
        type: "error",
        message:
          error instanceof Error ? error.message : `Could not open ${label}.`,
      });
    }
  }

  async function saveTransferStorageDir() {
    if (!config?.is_host_device) {
      addToast({
        type: "error",
        message: "Only the host device can change desktop storage settings.",
      });
      return;
    }

    setIsSavingStorageDir(true);

    try {
      const savedPath = await invoke<string>("set_transfer_storage_dir", {
        path: transferStorageDir,
      });
      setTransferStorageDir(savedPath);
      setSavedTransferStorageDir(savedPath);
      setStorageFallbackActive(false);

      addToast({
        type: "success",
        message: "Transfer folder saved. Restart Drop Den to apply it.",
      });
    } catch (error) {
      addToast({
        type: "error",
        message:
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Could not save the transfer folder.",
      });
    } finally {
      setIsSavingStorageDir(false);
    }
  }

  async function chooseTransferStorageDir() {
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: transferStorageDir || config?.storage_dir,
      title: "Choose Drop Den transfer storage folder",
    });

    if (selected) {
      setTransferStorageDir(selected);
    }
  }

  async function restoreDefaultTransferStorageDir() {
    if (
      !(await confirm({
        title: "Restore the default folder?",
        description:
          "Existing transfer files will stay in their current locations. New uploads use the default folder after restart.",
        confirmLabel: "Restore default",
      }))
    ) {
      return;
    }

    try {
      const defaultPath = await invoke<string>("reset_transfer_storage_dir");
      setTransferStorageDir(defaultPath);
      setSavedTransferStorageDir(defaultPath);
      setStorageFallbackActive(false);
      addToast({
        type: "success",
        message: "Default transfer folder restored. Restart to apply it.",
      });
    } catch (error) {
      addToast({
        type: "error",
        message:
          typeof error === "string"
            ? error
            : "Could not restore the default transfer folder.",
      });
    }
  }

  async function restartDesktopApp() {
    if (
      !(await confirm({
        title: "Restart Drop Den?",
        description:
          "The desktop app will restart now and apply the saved transfer folder.",
        confirmLabel: "Restart now",
      }))
    ) {
      return;
    }

    await invoke("restart_app");
  }

  async function clearLocalIdentity() {
    if (config?.is_host_device) {
      addToast({
        type: "error",
        message: "This device is host. Use Reset host instead.",
      });

      return;
    }

    if (
      !(await confirm({
        title: "Clear local identity?",
        description:
          "This removes the saved device identity from this desktop window. Backend data and transfers are not deleted.",
        confirmLabel: "Clear identity",
        tone: "danger",
      }))
    ) {
      return;
    }

    clearDevice();
    queryClient.invalidateQueries({ queryKey: ["config"] });
    queryClient.invalidateQueries({ queryKey: ["devices"] });

    addToast({
      type: "info",
      message: "Local device identity cleared.",
    });
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

      queryClient.invalidateQueries({ queryKey: ["messages"] });

      addToast({
        type: "success",
        message: "Messages cleared.",
      });
    } catch (error) {
      addToast({
        type: "error",
        message:
          error instanceof Error ? error.message : "Could not clear messages.",
      });
    }
  }

  async function clearAllTransfers() {
    if (!config?.is_host_device) {
      addToast({
        type: "error",
        message: "Only the host device can clear transfers.",
      });
      return;
    }

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

      addToast({
        type: "success",
        message: "All transfers cleared.",
      });
    } catch (error) {
      addToast({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not clear transfers.",
      });
    } finally {
      setIsClearingTransfers(false);
    }
  }

  async function resetHost() {
    if (
      !(await confirm({
        title: "Reset host identity?",
        description:
          "This desktop will be signed out as host. The next registered device will become the new host.",
        confirmLabel: "Reset host",
        tone: "danger",
      }))
    ) {
      return;
    }

    try {
      await resetHostIdentity();

      clearDevice();

      queryClient.invalidateQueries({ queryKey: ["config"] });
      queryClient.invalidateQueries({ queryKey: ["devices"] });

      addToast({
        type: "success",
        message: "Host identity reset.",
      });
    } catch (error) {
      addToast({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not reset host identity.",
      });
    }
  }

  async function resetDesktop() {
    if (
      !(await confirm({
        title: "Fully reset Drop Den?",
        description:
          "This permanently deletes every device, message, transfer, stored file, and desktop preference. Drop Den will restart.",
        confirmLabel: "Reset everything",
        tone: "danger",
        verificationText: "RESET DROP DEN",
      }))
    ) {
      return;
    }

    try {
      await resetDesktopData();
      await invoke("reset_transfer_storage_dir");
      clearDevice();
      await invoke("restart_app");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Could not fully reset Drop Den.";

      addToast({
        type: "error",
        message:
          message.includes("405")
            ? "Desktop backend is out of date. Rebuild and restart the sidecar, then try again."
            : message,
      });
    }
  }

  const content = (
    <>
      {!embedded && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Desktop settings</h2>
            <p className="mt-1 text-xs leading-5 text-neutral-600">
              Local desktop runtime details and quick actions.
            </p>
          </div>

          <div className="rounded-xl bg-neutral-100 p-2 text-neutral-700">
            <HardDrive size={16} />
          </div>
        </div>
      )}

      <div className={embedded ? "grid grid-cols-3 gap-1.5" : "mt-3 grid grid-cols-3 gap-1.5"}>
        <StatusPill
          label="Backend"
          value={configError ? "Offline" : config ? "Online" : "Checking"}
          tone={configError ? "danger" : "success"}
        />
        <StatusPill
          label="Role"
          value={config?.is_host_device ? "Host" : device ? "Joined" : "None"}
        />
        <StatusPill
          label="Storage"
          value={storageFallbackActive ? "Fallback" : "Ready"}
          tone={storageFallbackActive ? "danger" : "default"}
        />
      </div>

      <SettingsGroup title="Runtime details" description="URLs and managed desktop paths.">
        <div className="grid gap-1.5 text-xs">
          <SettingRow label="Mode" value={config?.mode ?? "desktop"} />
          <SettingRow label="Local URL" value={localUrl} />
          <SettingRow label="Join URL" value={joinUrl} />
          <SettingRow label="Data dir" value={config?.data_dir ?? "Unavailable"} />
          <SettingRow label="Transfers" value={displayedTransferStorageDir} />
          <SettingRow label="Database" value={config?.database_path ?? "Unavailable"} />
        </div>
      </SettingsGroup>

      <div className="mt-3 rounded-xl border border-neutral-200 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-neutral-900">Transfer storage</p>
            <p className="mt-1 text-[11px] leading-4 text-neutral-500">
              New uploads use this folder after restart.
            </p>
          </div>
          {storageChangePendingRestart && (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-800">
              Restart needed
            </span>
          )}
        </div>
        {storageFallbackActive && (
          <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-2 text-[11px] leading-4 text-red-700">
            The custom folder is unavailable. Drop Den is using its safe default.
          </p>
        )}
        <input
          id="transfer-storage-dir"
          className="mt-2 w-full min-w-0 truncate rounded-xl border border-neutral-300 px-3 py-2 text-xs outline-none focus:border-neutral-900 disabled:bg-neutral-100"
          type="text"
          value={transferStorageDir}
          title={transferStorageDir}
          onChange={(event) => setTransferStorageDir(event.target.value)}
          disabled={!config?.is_host_device || isSavingStorageDir}
          placeholder="/absolute/path/to/transfers"
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            type="button"
            onClick={chooseTransferStorageDir}
            disabled={!config?.is_host_device || isSavingStorageDir}
          >
            <FolderOpen size={14} /> Browse
          </button>
          <button
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-neutral-900 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            type="button"
            onClick={saveTransferStorageDir}
            disabled={!config?.is_host_device || isSavingStorageDir || !storageDirChanged}
          >
            <Save size={14} /> {isSavingStorageDir ? "Saving..." : "Save"}
          </button>
          <button
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            type="button"
            onClick={restoreDefaultTransferStorageDir}
            disabled={!config?.is_host_device || isSavingStorageDir}
          >
            <RotateCcw size={14} /> Restore default
          </button>
          {storageChangePendingRestart && (
            <button
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-700"
              type="button"
              onClick={restartDesktopApp}
            >
              <Power size={14} /> Restart now
            </button>
          )}
        </div>
      </div>

      <div className="mt-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
          Quick actions
        </p>
        <div className="grid grid-cols-2 gap-2">
          <QuickAction onClick={() => copyValue("Join URL", joinUrl)} primary>
            {copiedValue === "Join URL" ? <Check size={13} /> : <Copy size={13} />}
            Copy join URL
          </QuickAction>
          <QuickAction onClick={() => copyValue("Local URL", localUrl)}>
            {copiedValue === "Local URL" ? <Check size={13} /> : <Copy size={13} />}
            Copy local URL
          </QuickAction>
          <QuickAction onClick={() => openDesktopFolder("Data folder", "open_data_folder")}>
            <FolderOpen size={13} /> Open data
          </QuickAction>
          <QuickAction onClick={() => openDesktopFolder("Transfers folder", "open_transfers_folder")}>
            <FolderOpen size={13} /> Open transfers
          </QuickAction>
        </div>
      </div>

      <DesktopDiagnostics
        config={config}
        configError={configError}
        isRefreshing={isRefreshingConfig}
        lastUpdatedAt={configUpdatedAt}
        storageDir={displayedTransferStorageDir}
        storageFallbackActive={storageFallbackActive}
        onRefresh={refreshConfig}
      />

      <SettingsGroup title="Maintenance" description="Clear local content and identity.">
        <div className="grid grid-cols-2 gap-2">
          {!config?.is_host_device && (
            <QuickAction onClick={clearLocalIdentity} tone="warning">
              <RotateCcw size={13} /> Clear identity
            </QuickAction>
          )}
          <QuickAction onClick={clearAllMessages} tone="warning">
            <MessageSquareX size={13} /> Clear messages
          </QuickAction>
          <QuickAction onClick={clearAllTransfers} tone="warning" disabled={isClearingTransfers}>
            <Trash2 size={13} /> {isClearingTransfers ? "Clearing..." : "Clear transfers"}
          </QuickAction>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Danger zone" description="Host and application reset controls." tone="danger">
        <div className="grid gap-2">
          <QuickAction onClick={resetHost} tone="danger">
            <RotateCcw size={13} /> Reset host
          </QuickAction>
          <button
            className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-xl bg-red-700 px-3 py-2 text-xs font-medium text-white hover:bg-red-800"
            type="button"
            onClick={resetDesktop}
          >
            <ShieldAlert size={13} /> Full desktop reset
          </button>
        </div>
      </SettingsGroup>
    </>
  );

  if (embedded) {
    return content;
  }

  return <Card>{content}</Card>;
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-neutral-50 px-2.5 py-2">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400">
        {label}
      </p>
      <p className="mt-0.5 truncate font-medium text-neutral-800" title={value}>
        {value}
      </p>
    </div>
  );
}

function StatusPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "danger";
}) {
  const dotClass =
    tone === "success"
      ? "bg-emerald-500"
      : tone === "danger"
        ? "bg-red-500"
        : "bg-neutral-400";

  return (
    <div className="min-w-0 rounded-xl bg-neutral-50 px-2 py-2 text-center">
      <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-neutral-400">
        {label}
      </p>
      <p className="mt-1 flex items-center justify-center gap-1 text-[11px] font-semibold text-neutral-800">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
        <span className="truncate">{value}</span>
      </p>
    </div>
  );
}

function SettingsGroup({
  title,
  description,
  tone = "default",
  children,
}: {
  title: string;
  description: string;
  tone?: "default" | "danger";
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className={`mt-3 overflow-hidden rounded-xl border ${
        tone === "danger" ? "border-red-200" : "border-neutral-200"
      }`}
    >
      <button
        type="button"
        className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left ${
          tone === "danger"
            ? "bg-red-50 text-red-800 hover:bg-red-100"
            : "bg-neutral-50 text-neutral-900 hover:bg-neutral-100"
        }`}
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
      >
        <span className="min-w-0">
          <span className="block text-xs font-semibold">{title}</span>
          <span
            className={`mt-0.5 block truncate text-[11px] ${
              tone === "danger" ? "text-red-600" : "text-neutral-500"
            }`}
          >
            {description}
          </span>
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && <div className="border-t border-inherit bg-white p-3">{children}</div>}
    </div>
  );
}

function QuickAction({
  children,
  onClick,
  primary = false,
  tone = "default",
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void | Promise<void>;
  primary?: boolean;
  tone?: "default" | "warning" | "danger";
  disabled?: boolean;
}) {
  const colorClass = primary
    ? "border-neutral-950 bg-neutral-950 text-white hover:bg-neutral-800"
    : tone === "danger"
      ? "border-red-200 text-red-700 hover:bg-red-50"
      : tone === "warning"
        ? "border-amber-200 text-amber-800 hover:bg-amber-50"
        : "border-neutral-300 text-neutral-700 hover:bg-neutral-50";

  return (
    <button
      className={`inline-flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-50 ${colorClass}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
