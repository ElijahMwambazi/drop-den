import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock3,
  File,
  Inbox,
  LoaderCircle,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  clearInbox,
  deleteInboxItem,
  listInboxItems,
} from "../api/inbox";
import { useDeviceStore } from "../store/deviceStore";
import { useDialogStore } from "../store/dialogStore";
import { useToastStore } from "../store/toastStore";
import type { InboxItem as InboxItemType } from "../types";
import { CollapsibleSection } from "./CollapsibleSection";

export function SharedInboxPanel() {
  const queryClient = useQueryClient();
  const device = useDeviceStore((state) => state.device);
  const confirm = useDialogStore((state) => state.confirm);
  const addToast = useToastStore((state) => state.addToast);
  const {
    data: items = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["inbox", device?.id],
    queryFn: listInboxItems,
    enabled: Boolean(device),
    refetchInterval: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteInboxItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
      addToast({ type: "success", message: "Inbox item deleted." });
    },
    onError: () => {
      addToast({ type: "error", message: "Could not delete the inbox item." });
    },
  });

  const clearMutation = useMutation({
    mutationFn: clearInbox,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
      addToast({ type: "success", message: "Shared inbox cleared." });
    },
    onError: () => {
      addToast({ type: "error", message: "Could not clear the shared inbox." });
    },
  });

  const totalBytes = items.reduce((total, item) => total + item.size, 0);

  async function onClearInbox() {
    if (items.length === 0 || clearMutation.isPending) return;

    const confirmed = await confirm({
      title: "Clear shared inbox?",
      description:
        "This permanently removes every private staged file for this device. Published transfers are not affected.",
      confirmLabel: "Clear inbox",
      tone: "danger",
    });

    if (confirmed) clearMutation.mutate();
  }

  return (
    <CollapsibleSection
      title="Shared inbox"
      description="Private files staged for this device before publishing."
      defaultOpen={items.length > 0}
      badge={isLoading ? "…" : items.length}
      storageKey="panel:shared-inbox"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] text-neutral-500">
          <ShieldCheck size={14} className="text-emerald-600" />
          <span>
            {formatBytes(totalBytes)} private · expires after 24 hours
          </span>
        </div>

        {items.length > 0 && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            onClick={onClearInbox}
            disabled={clearMutation.isPending}
          >
            {clearMutation.isPending ? (
              <LoaderCircle size={13} className="animate-spin" />
            ) : (
              <Trash2 size={13} />
            )}
            Clear all
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="mt-3 flex min-h-24 items-center justify-center rounded-2xl bg-neutral-50 text-neutral-500">
          <LoaderCircle size={18} className="animate-spin" />
          <span className="ml-2 text-xs">Loading inbox…</span>
        </div>
      ) : isError ? (
        <div className="mt-3 rounded-2xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">
          The private inbox could not be loaded. It will retry automatically.
        </div>
      ) : items.length === 0 ? (
        <div className="mt-3 flex min-h-28 flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-4 text-center">
          <span className="rounded-xl bg-white p-2 text-neutral-400 shadow-sm">
            <Inbox size={18} />
          </span>
          <p className="mt-2 text-xs font-medium text-neutral-700">
            No shared files waiting
          </p>
          <p className="mt-1 max-w-sm text-[11px] leading-5 text-neutral-500">
            Android shares will wait here privately until you choose where to
            publish them.
          </p>
        </div>
      ) : (
        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
          {items.map((item) => (
            <InboxItem
              key={item.id}
              item={item}
              isDeleting={
                deleteMutation.isPending && deleteMutation.variables === item.id
              }
              onDelete={() => deleteMutation.mutate(item.id)}
            />
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}

function InboxItem({
  item,
  isDeleting,
  onDelete,
}: {
  item: InboxItemType;
  isDeleting: boolean;
  onDelete: () => void;
}) {
  return (
    <article className="flex min-w-0 items-center gap-3 rounded-xl bg-neutral-50 p-2.5">
      <span className="shrink-0 rounded-lg bg-white p-2 text-neutral-500 shadow-sm">
        <File size={15} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-neutral-900" title={item.filename}>
          {item.filename}
        </p>
        <p className="mt-0.5 truncate text-[10px] text-neutral-500">
          {formatBytes(item.size)} · {item.mime_type}
        </p>
        <p className="mt-1 flex items-center gap-1 text-[10px] text-neutral-400">
          <Clock3 size={11} />
          {formatExpiry(item.expires_at)}
        </p>
      </div>

      <button
        type="button"
        className="shrink-0 rounded-lg border border-neutral-200 bg-white p-2 text-neutral-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
        onClick={onDelete}
        disabled={isDeleting}
        aria-label={`Delete ${item.filename}`}
      >
        {isDeleting ? (
          <LoaderCircle size={14} className="animate-spin" />
        ) : (
          <Trash2 size={14} />
        )}
      </button>
    </article>
  );
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;

  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function formatExpiry(value: string) {
  const remainingMs = new Date(value).getTime() - Date.now();

  if (remainingMs <= 0) return "Expiring now";

  const hours = Math.floor(remainingMs / 3_600_000);
  if (hours >= 1) return `Expires in ${hours}h`;

  const minutes = Math.max(1, Math.floor(remainingMs / 60_000));
  return `Expires in ${minutes}m`;
}
