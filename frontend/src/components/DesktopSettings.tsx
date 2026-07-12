import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
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
import { useEffect, useState } from "react";
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

  const { data: config } = useQuery({
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

      <div
        className={embedded ? "grid gap-2 text-xs" : "mt-3 grid gap-2 text-xs"}
      >
        <SettingRow label="Mode" value={config?.mode ?? "desktop"} />
        <SettingRow label="Local URL" value={localUrl} />
        <SettingRow label="Join URL" value={joinUrl} />
        <SettingRow
          label="Data dir"
          value={config?.data_dir ?? "Unavailable"}
        />
        <SettingRow
          label={
            storageFallbackActive
              ? "Transfers (safe default)"
              : storageChangePendingRestart
              ? "Transfers (after restart)"
              : "Transfers"
          }
          value={displayedTransferStorageDir}
        />
        <SettingRow
          label="Database"
          value={config?.database_path ?? "Unavailable"}
        />
      </div>

      <div className="mt-3 rounded-xl border border-neutral-200 p-3">
        <label
          className="text-xs font-medium text-neutral-800"
          htmlFor="transfer-storage-dir"
        >
          Transfer storage folder
        </label>
        <p className="mt-1 text-[11px] leading-4 text-neutral-500">
          Existing transfer files stay in their original locations and remain
          available. Only new uploads use the selected folder after restart.
        </p>
        {storageFallbackActive && (
          <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-2 text-[11px] leading-4 text-red-700">
            The saved custom folder is unavailable. Drop Den started with its
            safe default folder; choose another location or restore the default.
          </p>
        )}
        {storageChangePendingRestart && (
          <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
            Saved and displayed above. Restart Drop Den to begin storing new
            transfers there.
          </p>
        )}
        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <input
            id="transfer-storage-dir"
            className="min-w-0 rounded-xl border border-neutral-300 px-3 py-2 text-xs outline-none focus:border-neutral-900 disabled:bg-neutral-100"
            type="text"
            value={transferStorageDir}
            onChange={(event) => setTransferStorageDir(event.target.value)}
            disabled={!config?.is_host_device || isSavingStorageDir}
            placeholder="/absolute/path/to/transfers"
          />
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            type="button"
            onClick={chooseTransferStorageDir}
            disabled={!config?.is_host_device || isSavingStorageDir}
          >
            <FolderOpen size={14} />
            Browse
          </button>
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-neutral-900 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            onClick={saveTransferStorageDir}
            disabled={
              !config?.is_host_device ||
              isSavingStorageDir ||
              transferStorageDir.trim().length === 0 ||
              transferStorageDir.trim() === savedTransferStorageDir
            }
          >
            <Save size={14} />
            {isSavingStorageDir ? "Saving..." : "Save"}
          </button>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            type="button"
            onClick={restoreDefaultTransferStorageDir}
            disabled={!config?.is_host_device || isSavingStorageDir}
          >
            <RotateCcw size={14} />
            Restore default
          </button>
          {storageChangePendingRestart && (
            <button
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-700"
              type="button"
              onClick={restartDesktopApp}
            >
              <Power size={14} />
              Restart now
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-3 py-2 text-xs font-medium text-white"
            type="button"
            onClick={() => copyValue("Join URL", joinUrl)}
          >
            {copiedValue === "Join URL" ? (
              <Check size={14} />
            ) : (
              <Copy size={14} />
            )}
            Copy join URL
          </button>

          <button
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            type="button"
            onClick={() => copyValue("Local URL", localUrl)}
          >
            {copiedValue === "Local URL" ? (
              <Check size={14} />
            ) : (
              <Copy size={14} />
            )}
            Copy local URL
          </button>

          <button
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            type="button"
            onClick={() => openDesktopFolder("Data folder", "open_data_folder")}
          >
            <FolderOpen size={14} />
            Open data folder
          </button>

          <button
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            type="button"
            onClick={() =>
              openDesktopFolder("Transfers folder", "open_transfers_folder")
            }
          >
            <FolderOpen size={14} />
            Open transfers folder
          </button>

          <button
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-amber-200 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            onClick={clearLocalIdentity}
            disabled={Boolean(config?.is_host_device)}
            title={
              config?.is_host_device
                ? "Host devices should use Reset host instead."
                : undefined
            }
          >
            <RotateCcw size={14} />
            Clear local identity
          </button>

          <button
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-amber-200 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            onClick={clearAllMessages}
          >
            <MessageSquareX size={14} />
            Clear messages
          </button>

          <button
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            onClick={clearAllTransfers}
            disabled={!config?.is_host_device || isClearingTransfers}
          >
            <Trash2 size={14} />
            {isClearingTransfers ? "Clearing transfers..." : "Clear transfers"}
          </button>

          <button
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
            type="button"
            onClick={resetHost}
          >
            <RotateCcw size={14} />
            Reset host
          </button>

          <button
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-red-700 px-3 py-2 text-xs font-medium text-white hover:bg-red-800"
            type="button"
            onClick={resetDesktop}
          >
            <ShieldAlert size={14} />
            Full desktop reset
          </button>
        </div>
      </div>
    </>
  );

  if (embedded) {
    return content;
  }

  return <Card>{content}</Card>;
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-xl bg-neutral-50 px-3 py-2">
      <p className="font-medium uppercase tracking-[0.16em] text-neutral-400">
        {label}
      </p>
      <p className="break-all font-medium text-neutral-800">{value}</p>
    </div>
  );
}
