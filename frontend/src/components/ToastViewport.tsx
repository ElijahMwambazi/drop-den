import { CheckCircle, Info, X, XCircle } from "lucide-react";
import { useToastStore, type ToastType } from "../store/toastStore";
import { isTauriRuntime } from "../api/client";

export function ToastViewport() {
  const { toasts, removeToast } = useToastStore();
  const isDesktopRuntime = isTauriRuntime();

  if (toasts.length === 0) return null;

  const visibleToasts = toasts.slice(isDesktopRuntime ? -2 : -3);

  return (
    <div
      className={`fixed left-1/2 z-[60] flex w-[calc(100%-1.5rem)] max-w-xs -translate-x-1/2 flex-col gap-2 ${
        isDesktopRuntime ? "bottom-12" : "bottom-3"
      }`}
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {visibleToasts.map((toast) => (
        <div
          key={toast.id}
          className="flex min-h-11 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 shadow-lg"
        >
          <ToastIcon type={toast.type} />

          <p className="min-w-0 flex-1 text-left text-xs font-medium leading-5 text-neutral-800">
            {toast.message}
          </p>

          {toast.count > 1 && (
            <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600">
              ×{toast.count}
            </span>
          )}

          <button
            className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            type="button"
            onClick={() => removeToast(toast.id)}
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ToastIcon({ type }: { type: ToastType }) {
  if (type === "success") {
    return <CheckCircle className="mt-0.5 text-green-700" size={16} />;
  }

  if (type === "error") {
    return <XCircle className="mt-0.5 text-red-600" size={16} />;
  }

  return <Info className="mt-0.5 text-neutral-700" size={16} />;
}
