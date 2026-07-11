import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, HardDrive, RotateCcw } from "lucide-react";
import { useState } from "react";
import { getConfig } from "../api/config";
import { useDeviceStore } from "../store/deviceStore";
import { useToastStore } from "../store/toastStore";
import { Card } from "./Card";

function isTauriRuntime() {
  return window.location.protocol === "tauri:";
}

export function DesktopSettings() {
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const device = useDeviceStore((state) => state.device);
  const clearDevice = useDeviceStore((state) => state.clearDevice);
  const addToast = useToastStore((state) => state.addToast);

  const { data: config } = useQuery({
    queryKey: ["config", device?.id],
    queryFn: () => getConfig(device?.id),
    enabled: isTauriRuntime(),
  });

  if (!isTauriRuntime()) {
    return null;
  }

  const localUrl = config?.local_origin ?? "http://127.0.0.1:18080";
  const joinUrl = config?.recommended_join_origin ?? localUrl;

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

  function clearLocalIdentity() {
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

  return (
    <Card>
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

      <div className="mt-3 grid gap-2 text-xs">
        <SettingRow label="Mode" value={config?.mode ?? "desktop"} />
        <SettingRow label="Local URL" value={localUrl} />
        <SettingRow label="Join URL" value={joinUrl} />
        <SettingRow
          label="Data dir"
          value={config?.data_dir ?? "Unavailable"}
        />
        <SettingRow
          label="Transfers"
          value={config?.storage_dir ?? "Unavailable"}
        />
        <SettingRow
          label="Database"
          value={config?.database_path ?? "Unavailable"}
        />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-neutral-900 px-3 py-2 text-xs font-medium text-white"
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
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-200 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-50 sm:col-span-2"
          type="button"
          onClick={clearLocalIdentity}
        >
          <RotateCcw size={14} />
          Clear local identity
        </button>
      </div>
    </Card>
  );
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
