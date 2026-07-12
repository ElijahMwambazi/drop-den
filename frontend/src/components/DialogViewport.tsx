import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useDialogStore } from "../store/dialogStore";

export function DialogViewport() {
  const dialog = useDialogStore((state) => state.dialog);
  const resolve = useDialogStore((state) => state.resolve);
  const [verification, setVerification] = useState("");

  useEffect(() => {
    setVerification("");
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") resolve(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialog, resolve]);

  if (!dialog) return null;

  const canConfirm =
    !dialog.verificationText || verification === dialog.verificationText;
  const isDanger = dialog.tone === "danger";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950/55 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) resolve(false);
      }}
    >
      <section
        className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-5 text-neutral-950 shadow-2xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="drop-den-dialog-title"
        aria-describedby="drop-den-dialog-description"
      >
        <div className="flex items-start gap-3">
          <div
            className={`rounded-xl p-2 ${
              isDanger ? "bg-red-50 text-red-700" : "bg-neutral-100"
            }`}
          >
            <AlertTriangle size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="drop-den-dialog-title" className="text-base font-semibold">
              {dialog.title}
            </h2>
            <p
              id="drop-den-dialog-description"
              className="mt-1 text-sm leading-6 text-neutral-600"
            >
              {dialog.description}
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
            onClick={() => resolve(false)}
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>

        {dialog.verificationText && (
          <div className="mt-4">
            <label className="text-xs font-medium text-neutral-700">
              Type <strong>{dialog.verificationText}</strong> to continue
            </label>
            <input
              className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-neutral-900"
              value={verification}
              onChange={(event) => setVerification(event.target.value)}
              autoFocus
            />
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            onClick={() => resolve(false)}
          >
            {dialog.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            className={`rounded-xl px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 ${
              isDanger
                ? "bg-red-700 hover:bg-red-800"
                : "bg-neutral-950 hover:bg-neutral-800"
            }`}
            disabled={!canConfirm}
            onClick={() => resolve(true)}
          >
            {dialog.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </section>
    </div>
  );
}
