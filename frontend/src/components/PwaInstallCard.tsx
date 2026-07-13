import { useEffect, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import { isTauriRuntime } from "../api/client";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "drop-den-pwa-install-dismissed";

export function PwaInstallCard() {
  const [installPrompt, setInstallPrompt] =
    useState<InstallPromptEvent | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === "true",
  );

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const isFirefox = /firefox/i.test(navigator.userAgent);
  const canOfferBrowserInstall =
    !isTauriRuntime() && window.location.protocol === "https:" && !isStandalone;

  useEffect(() => {
    function captureInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    }

    function showUpdate() {
      setUpdateAvailable(true);
    }

    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("drop-den-sw-update", showUpdate);

    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("drop-den-sw-update", showUpdate);
    };
  }, []);

  useEffect(() => {
    let isReloading = false;

    function reloadAfterUpdate() {
      if (isReloading) return;
      isReloading = true;
      window.location.reload();
    }

    navigator.serviceWorker?.addEventListener(
      "controllerchange",
      reloadAfterUpdate,
    );
    return () =>
      navigator.serviceWorker?.removeEventListener(
        "controllerchange",
        reloadAfterUpdate,
      );
  }, []);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") setInstallPrompt(null);
  }

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "true");
    setDismissed(true);
  }

  function applyUpdate() {
    navigator.serviceWorker.getRegistration().then((registration) => {
      registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
    });
  }

  if (updateAvailable) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 shadow-sm">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-neutral-900">Update ready</p>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            Reload Drop Den to use the latest version.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-neutral-950 px-3 py-2 text-xs font-medium text-white"
          onClick={applyUpdate}
        >
          <RefreshCw size={13} /> Update
        </button>
      </div>
    );
  }

  if (
    !canOfferBrowserInstall ||
    dismissed ||
    (!installPrompt && !isFirefox)
  ) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-neutral-900">Install Drop Den</p>
        <p className="mt-0.5 text-[11px] leading-4 text-neutral-500">
          {isFirefox && !installPrompt
            ? "Use Firefox’s menu and choose Install."
            : "Add this den to your home screen for quicker access."}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {installPrompt && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-950 px-3 py-2 text-xs font-medium text-white"
            onClick={install}
          >
            <Download size={13} /> Install
          </button>
        )}
        <button
          type="button"
          className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
          onClick={dismiss}
          aria-label="Dismiss install suggestion"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
