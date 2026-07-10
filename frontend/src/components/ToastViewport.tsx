import { CheckCircle, Info, X, XCircle } from "lucide-react";
import { useToastStore, type ToastType } from "../store/toastStore";

export function ToastViewport() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-3 right-3 z-[60] flex w-[calc(100%-1.5rem)] max-w-xs flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="flex items-start gap-2 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg"
        >
          <ToastIcon type={toast.type} />

          <p className="min-w-0 flex-1 text-xs font-medium text-neutral-800">
            {toast.message}
          </p>

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
