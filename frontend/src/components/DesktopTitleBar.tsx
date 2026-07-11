import { Minus, Square, X } from "lucide-react";
import { isTauriRuntime } from "../api/client";

async function getWindow() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export function DesktopTitleBar() {
  if (!isTauriRuntime()) {
    return null;
  }

  async function startDragging() {
    const currentWindow = await getWindow();
    await currentWindow.startDragging();
  }

  async function minimizeWindow() {
    const currentWindow = await getWindow();
    await currentWindow.minimize();
  }

  async function toggleMaximizeWindow() {
    const currentWindow = await getWindow();
    await currentWindow.toggleMaximize();
  }

  async function closeWindow() {
    const currentWindow = await getWindow();
    await currentWindow.close();
  }

  return (
    <div
      className="fixed left-0 right-0 top-0 z-50 flex h-9 select-none items-center justify-between border-b border-neutral-800 bg-neutral-950 px-2.5 text-neutral-100"
      onMouseDown={startDragging}
    >
      <div className="flex items-center gap-2">
        <div className="h-2.5 w-2.5 rounded-full bg-neutral-100" />
        <span className="text-xs font-semibold tracking-wide">Drop Den</span>
      </div>

      <div
        className="flex items-center gap-1"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="rounded-md p-1.5 text-neutral-300 hover:bg-neutral-800 hover:text-white"
          onClick={minimizeWindow}
          aria-label="Minimize"
        >
          <Minus size={13} />
        </button>

        <button
          type="button"
          className="rounded-md p-1.5 text-neutral-300 hover:bg-neutral-800 hover:text-white"
          onClick={toggleMaximizeWindow}
          aria-label="Maximize"
        >
          <Square size={11} />
        </button>

        <button
          type="button"
          className="rounded-md p-1.5 text-neutral-300 hover:bg-red-600 hover:text-white"
          onClick={closeWindow}
          aria-label="Close"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
