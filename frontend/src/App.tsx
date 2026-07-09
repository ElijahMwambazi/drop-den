import { useEffect } from "react";
import { DeviceList } from "./components/DeviceList";
import { DeviceSetup } from "./components/DeviceSetup";
import { FileUpload } from "./components/FileUpload";
import { JoinCard } from "./components/JoinCard";
import { MessagePanel } from "./components/MessagePanel";
import { ToastViewport } from "./components/ToastViewport";
import { TransferList } from "./components/TransferList";
import { useWebSocketRefresh } from "./hooks/useWebSocketRefresh";
import { useDeviceStore } from "./store/deviceStore";

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

  const device = useDeviceStore((state) => state.device);
  const isJoined = Boolean(device);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-8">
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

      <JoinCard />

      {!isJoined ? (
        <div className="max-w-3xl">
          <DeviceSetup />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="min-w-0 space-y-5">
            <DeviceSetup />
            <FileUpload />
            <TransferList />
            <MessagePanel />
          </div>

          <DeviceList />
        </div>
      )}

      <ToastViewport />
    </main>
  );
}
