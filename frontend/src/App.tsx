import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { DeviceList } from "./components/DeviceList";
import { DeviceSetup } from "./components/DeviceSetup";
import { FileUpload } from "./components/FileUpload";
import { JoinCard } from "./components/JoinCard";
import { MessagePanel } from "./components/MessagePanel";
import { ToastViewport } from "./components/ToastViewport";
import { DialogViewport } from "./components/DialogViewport";
import { AppFooter } from "./components/AppFooter";
import { PwaInstallCard } from "./components/PwaInstallCard";
import { TransferList } from "./components/TransferList";
import { DesktopTitleBar } from "./components/DesktopTitleBar";
import { DesktopSettings } from "./components/DesktopSettings";
import { HostSettings } from "./components/HostSettings";
import { CollapsibleSection } from "./components/CollapsibleSection";
import { useWebSocketRefresh } from "./hooks/useWebSocketRefresh";
import { useDeviceStore } from "./store/deviceStore";
import { isTauriRuntime } from "./api/client";
import { getConfig } from "./api/config";

function useGlobalDragDropGuard() {
  useEffect(() => {
    function preventFileDropNavigation(event: DragEvent) {
      const hasFiles = Array.from(event.dataTransfer?.types ?? []).includes(
        "Files",
      );

      if (!hasFiles) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    }

    window.addEventListener("dragover", preventFileDropNavigation);
    window.addEventListener("drop", preventFileDropNavigation);

    return () => {
      window.removeEventListener("dragover", preventFileDropNavigation);
      window.removeEventListener("drop", preventFileDropNavigation);
    };
  }, []);
}

export function App() {
  useWebSocketRefresh();
  useGlobalDragDropGuard();

  const isDesktopRuntime = isTauriRuntime();
  const device = useDeviceStore((state) => state.device);
  const isJoined = Boolean(device);

  const { data: config } = useQuery({
    queryKey: ["config", device?.id],
    queryFn: () => getConfig(device?.id),
    enabled: Boolean(device),
  });

  const isHostDevice = Boolean(config?.is_host_device);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "desktop-runtime",
      isDesktopRuntime,
    );
    document.body.classList.toggle("desktop-runtime", isDesktopRuntime);

    return () => {
      document.documentElement.classList.remove("desktop-runtime");
      document.body.classList.remove("desktop-runtime");
    };
  }, [isDesktopRuntime]);

  return (
    <div
      className={
        isDesktopRuntime
          ? "h-screen w-screen overflow-hidden bg-transparent p-px"
          : "contents"
      }
    >
      <div
        className={
          isDesktopRuntime
            ? "relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-black/10"
            : "contents"
        }
      >
        <DesktopTitleBar />

        <main
          className={
            isDesktopRuntime
              ? "flex min-h-0 w-full flex-1 flex-col gap-3 overflow-y-auto px-3 pb-4 pt-11 text-[13px]"
              : "mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-8"
          }
        >
        {isDesktopRuntime ? (
          <header className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-950 px-4 py-3 text-white shadow-sm">
            <div className="min-w-0">
              <p className="text-[9px] font-medium uppercase tracking-[0.2em] text-neutral-500">
                Local transfer hub
              </p>
              <h1 className="mt-0.5 text-lg font-bold tracking-tight">Drop Den</h1>
            </div>
            <div className="min-w-0 rounded-full bg-white/10 px-2.5 py-1 text-[10px] text-neutral-300">
              <span className="block max-w-32 truncate">
                {device?.name ?? "Not joined"}
              </span>
            </div>
          </header>
        ) : isJoined ? (
          <header
            className={`bg-neutral-950 text-white shadow-sm ${
              isHostDevice
                ? "rounded-4xl p-5 md:p-6"
                : "flex items-center justify-between gap-3 rounded-3xl px-5 py-4"
            }`}
          >
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-neutral-500">
                Local transfer hub
              </p>
              <h1
                className={`font-bold tracking-tight ${
                  isHostDevice ? "mt-2 text-3xl" : "mt-1 text-2xl"
                }`}
              >
                Drop Den
              </h1>
              {isHostDevice && (
                <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-300">
                  Share files and messages with devices on your local network.
                </p>
              )}
            </div>
            <span className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-neutral-200">
              {isHostDevice ? "Host" : device?.name}
            </span>
          </header>
        ) : (
          <header className="rounded-4xl bg-neutral-950 p-6 text-white shadow-sm md:p-8">
            <p className="text-sm font-medium uppercase tracking-[0.3em] text-neutral-400">
              Local-only transfer hub
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-6xl">
              Drop Den
            </h1>
            <p className="mt-4 max-w-2xl text-neutral-300">
              Move files, media, and text messages between nearby devices through
              one host machine. No cloud. No accounts. Just the local network.
            </p>
          </header>
        )}

        <PwaInstallCard />

        <JoinCard />

        {!isJoined ? (
          <div className="max-w-3xl space-y-3">
            <DeviceSetup />
            <DesktopSettings />
          </div>
        ) : (
          <div
            className={[
              "grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]",
              isDesktopRuntime
                ? "gap-3 lg:grid-cols-[minmax(0,1fr)_260px]"
                : "",
            ].join(" ")}
          >
            <div
              className={[
                "min-w-0 space-y-5",
                isDesktopRuntime ? "space-y-3" : "",
              ].join(" ")}
            >
              <DeviceSetup />
              <FileUpload />
              <TransferList />

              <CollapsibleSection
                title="Messages"
                description="Send short local notes to connected devices."
                defaultOpen={!isDesktopRuntime}
              >
                <MessagePanel embedded />
              </CollapsibleSection>
            </div>

            <aside
              className={[
                "min-w-0 space-y-5",
                isDesktopRuntime ? "space-y-3" : "",
              ].join(" ")}
            >
              <CollapsibleSection
                title="Connected devices"
                description="Devices currently registered in this den."
                defaultOpen
              >
                <DeviceList embedded />
              </CollapsibleSection>

              {config?.is_host_device && (
                <CollapsibleSection
                  title="Host settings"
                  description="Den-wide maintenance and host identity."
                  defaultOpen={false}
                >
                  <HostSettings embedded />
                </CollapsibleSection>
              )}

              {isDesktopRuntime && (
                <CollapsibleSection
                  title="Desktop runtime"
                  description="Local paths, diagnostics, and desktop actions."
                  defaultOpen={false}
                >
                  <DesktopSettings embedded />
                </CollapsibleSection>
              )}
            </aside>
          </div>
        )}

          <ToastViewport />
          <DialogViewport />
        </main>
        <AppFooter />
      </div>
    </div>
  );
}
