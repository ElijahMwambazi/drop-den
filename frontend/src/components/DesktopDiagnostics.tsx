import { useEffect, useState } from "react";
import { Activity, Check, ChevronDown, Copy, RefreshCw } from "lucide-react";
import { useDeviceStore } from "../store/deviceStore";
import { useToastStore } from "../store/toastStore";
import type { AppConfig } from "../types";
import { usePersistentDisclosure } from "../hooks/usePersistentDisclosure";

type DesktopDiagnosticsProps = {
  config?: AppConfig;
  configError: boolean;
  isRefreshing: boolean;
  lastUpdatedAt: number;
  storageDir: string;
  storageFallbackActive: boolean;
  onRefresh: () => Promise<unknown>;
};

export function DesktopDiagnostics({
  config,
  configError,
  isRefreshing,
  lastUpdatedAt,
  storageDir,
  storageFallbackActive,
  onRefresh,
}: DesktopDiagnosticsProps) {
  const [isOpen, toggleOpen] = usePersistentDisclosure(
    "desktop-settings:diagnostics",
  );
  const [appVersion, setAppVersion] = useState("Unavailable");
  const [copied, setCopied] = useState(false);
  const device = useDeviceStore((state) => state.device);
  const addToast = useToastStore((state) => state.addToast);

  useEffect(() => {
    import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then(setAppVersion)
      .catch(() => setAppVersion("Unavailable"));
  }, []);

  const backendOnline = Boolean(config) && !configError;
  const role = !device
    ? "Not joined"
    : config?.is_host_device
      ? "Host"
      : "Joined";

  async function copyDiagnostics() {
    const report = [
      "Drop Den desktop diagnostics",
      `App version: ${appVersion}`,
      `Backend: ${backendOnline ? "Online" : "Unavailable"}`,
      `Mode: ${config?.mode ?? "desktop"}`,
      `Role: ${role}`,
      `Device: ${device?.name ?? "Not joined"}`,
      `Local URL: ${config?.local_origin ?? "http://127.0.0.1:18080"}`,
      `Data directory: ${config?.data_dir ?? "Unavailable"}`,
      `Database: ${config?.database_path ?? "Unavailable"}`,
      `Transfer storage: ${storageDir}`,
      `Storage fallback: ${storageFallbackActive ? "Active" : "No"}`,
      `Platform: ${navigator.platform || "Unavailable"}`,
      `User agent: ${navigator.userAgent}`,
      `Captured: ${new Date().toISOString()}`,
    ].join("\n");

    await navigator.clipboard.writeText(report);
    setCopied(true);
    addToast({ type: "success", message: "Diagnostics copied." });
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 bg-neutral-50 px-3 py-2.5 text-left hover:bg-neutral-100"
        onClick={toggleOpen}
        aria-expanded={isOpen}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Activity size={15} className="shrink-0 text-neutral-600" />
          <span>
            <span className="block text-xs font-semibold text-neutral-900">
              Diagnostics
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-neutral-500">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  backendOnline ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
              Backend {backendOnline ? "online" : "unavailable"}
            </span>
          </span>
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-neutral-500 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="border-t border-neutral-200 bg-white p-3">
          <div className="grid gap-2 text-[11px] sm:grid-cols-2">
            <DiagnosticValue label="App version" value={appVersion} />
            <DiagnosticValue label="Backend" value={backendOnline ? "Online" : "Unavailable"} />
            <DiagnosticValue label="Role" value={role} />
            <DiagnosticValue label="Mode" value={config?.mode ?? "desktop"} />
            <DiagnosticValue
              label="Storage"
              value={storageFallbackActive ? "Safe fallback" : "Configured"}
            />
            <DiagnosticValue
              label="Last refresh"
              value={
                lastUpdatedAt
                  ? new Date(lastUpdatedAt).toLocaleTimeString()
                  : "Not available"
              }
            />
          </div>

          <div className="mt-2 rounded-lg bg-neutral-50 px-2.5 py-2 text-[11px] leading-4 text-neutral-600">
            <p className="break-all">
              <span className="font-semibold text-neutral-800">API:</span>{" "}
              {config?.local_origin ?? "http://127.0.0.1:18080"}
            </p>
            <p className="mt-1 break-all">
              <span className="font-semibold text-neutral-800">Storage:</span>{" "}
              {storageDir}
            </p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              onClick={() => void onRefresh()}
              disabled={isRefreshing}
            >
              <RefreshCw
                size={13}
                className={isRefreshing ? "animate-spin" : ""}
              />
              {isRefreshing ? "Checking..." : "Check again"}
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-950 px-3 py-2 text-xs font-medium text-white hover:bg-neutral-800"
              onClick={copyDiagnostics}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Copied" : "Copy report"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DiagnosticValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-neutral-50 px-2.5 py-2">
      <p className="uppercase tracking-[0.14em] text-neutral-400">{label}</p>
      <p className="mt-1 font-semibold text-neutral-800">{value}</p>
    </div>
  );
}
