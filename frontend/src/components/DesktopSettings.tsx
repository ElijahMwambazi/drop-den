import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  FolderOpen,
  HardDrive,
  MessageSquareX,
  RotateCcw,
  Save,
} from "lucide-react";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getConfig } from "../api/config";
import { resetHostIdentity } from "../api/devices";
import { clearMessages } from "../api/messages";
import { useDeviceStore } from "../store/deviceStore";
import { useToastStore } from "../store/toastStore";
import { Card } from "./Card";
import { isTauriRuntime } from "../api/client";

type DesktopSettingsProps = {
  embedded?: boolean;
};

export function DesktopSettings({ embedded = false }: DesktopSettingsProps) {
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [transferStorageDir, setTransferStorageDir] = useState("");
  const [savedTransferStorageDir, setSavedTransferStorageDir] = useState("");
  const [isSavingStorageDir, setIsSavingStorageDir] = useState(false);

  const queryClient = useQueryClient();
  const device = useDeviceStore((state) => state.device);
  const clearDevice = useDeviceStore((state) => state.clearDevice);
  const addToast = useToastStore((state) => state.addToast);

  const { data: config } = useQuery({
    queryKey: ["config", device?.id],
    queryFn: () => getConfig(device?.id),
    enabled: isTauriRuntime(),
  });

  useEffect(() => {
    if (config?.storage_dir && !savedTransferStorageDir) {
      setTransferStorageDir(config.storage_dir);
      setSavedTransferStorageDir(config.storage_dir);
    }
  }, [config?.storage_dir, savedTransferStorageDir]);

  if (!isTauriRuntime()) {
    return null;
  }

  const localUrl = config?.local_origin ?? "http://127.0.0.1:18080";
  const joinUrl = config?.recommended_join_origin ?? localUrl;
  const displayedTransferStorageDir =
    savedTransferStorageDir || config?.storage_dir || "Unavailable";
  const storageChangePendingRestart = Boolean(
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

  function clearLocalIdentity() {
    if (config?.is_host_device) {
      addToast({
        type: "error",
        message: "This device is host. Use Reset host instead.",
      });

      return;
    }

    if (
      !window.confirm(
        "Clear this desktop window's saved device identity? This does not delete the backend database or transfers.",
      )
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
    if (!window.confirm("Clear all local messages from this den?")) {
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

  async function resetHost() {
    if (
      !window.confirm(
        "Reset the host identity? The next registered device will become the host.",
      )
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
            storageChangePendingRestart
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
          New uploads use this folder after Drop Den restarts. Existing files
          are not moved.
        </p>
        {storageChangePendingRestart && (
          <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
            Saved and displayed above. Restart Drop Den to begin storing new
            transfers there.
          </p>
        )}
        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
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
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
            type="button"
            onClick={resetHost}
          >
            <RotateCcw size={14} />
            Reset host
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
