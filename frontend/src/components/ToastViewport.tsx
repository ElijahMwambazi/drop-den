import { CheckCircle, Info, X, XCircle } from "lucide-react";
import { useToastStore, type ToastType } from "../store/toastStore";

export function ToastViewport() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-lg"
        >
          <ToastIcon type={toast.type} />

          <p className="min-w-0 flex-1 text-sm font-medium text-neutral-800">
            {toast.message}
          </p>

          <button
            className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            type="button"
            onClick={() => removeToast(toast.id)}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ToastIcon({ type }: { type: ToastType }) {
  if (type === "success") {
    return <CheckCircle className="mt-0.5 text-green-700" size={18} />;
  }

  if (type === "error") {
    return <XCircle className="mt-0.5 text-red-600" size={18} />;
  }

  return <Info className="mt-0.5 text-neutral-700" size={18} />;
}
