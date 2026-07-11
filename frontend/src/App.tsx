import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { DeviceList } from "./components/DeviceList";
import { DeviceSetup } from "./components/DeviceSetup";
import { FileUpload } from "./components/FileUpload";
import { JoinCard } from "./components/JoinCard";
import { MessagePanel } from "./components/MessagePanel";
import { ToastViewport } from "./components/ToastViewport";
import { TransferList } from "./components/TransferList";
import { DesktopTitleBar } from "./components/DesktopTitleBar";
import { DesktopSettings } from "./components/DesktopSettings";
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
    enabled: isDesktopRuntime && Boolean(device),
  });

  const canShowDesktopSettings =
    isDesktopRuntime && Boolean(device) && Boolean(config?.is_host_device);

  return (
    <>
      <DesktopTitleBar />

      <main
        className={[
          "mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-8",
          isDesktopRuntime ? "gap-3 px-2.5 py-3 pt-11 text-[13px]" : "",
        ].join(" ")}
      >
        <header
          className={[
            "rounded-4xl bg-neutral-950 p-6 text-white shadow-sm md:p-8",
            isDesktopRuntime ? "rounded-2xl p-4 md:p-4" : "",
          ].join(" ")}
        >
          <p
            className={[
              "text-sm font-medium uppercase tracking-[0.3em] text-neutral-400",
              isDesktopRuntime ? "text-[10px] tracking-[0.22em]" : "",
            ].join(" ")}
          >
            Local-only transfer hub
          </p>
          <h1
            className={[
              "mt-3 text-4xl font-bold tracking-tight md:text-6xl",
              isDesktopRuntime ? "mt-2 text-2xl md:text-2xl" : "",
            ].join(" ")}
          >
            Drop Den
          </h1>
          <p
            className={[
              "mt-4 max-w-2xl text-neutral-300",
              isDesktopRuntime ? "mt-2 text-xs leading-5" : "",
            ].join(" ")}
          >
            Move files, media, and text messages between nearby devices through
            one host machine. No cloud. No accounts. Just the local network.
          </p>
        </header>

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

              {isDesktopRuntime && config?.is_host_device && (
                <CollapsibleSection
                  title="Desktop settings"
                  description="Runtime paths, quick actions, and maintenance."
                  defaultOpen={false}
                >
                  <DesktopSettings embedded />
                </CollapsibleSection>
              )}
            </aside>
          </div>
        )}

        <ToastViewport />
      </main>
    </>
  );
}
