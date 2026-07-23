import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  Download,
  File,
  FileStack,
  Film,
  Image as ImageIcon,
  Music2,
  Trash2,
} from "lucide-react";
import { isTauriRuntime } from "../api/client";
import { getConfig } from "../api/config";
import { listDevices } from "../api/devices";
import {
  acceptTransfer,
  deleteAllTransfers,
  deleteTransfer,
  createDownloadAllTransfersUrl,
  createTransferDownloadUrl,
  listTransfers,
  rejectTransfer,
} from "../api/transfers";
import { useDeviceStore } from "../store/deviceStore";
import { useToastStore } from "../store/toastStore";
import type { Device, Transfer, TransferStatus } from "../types";
import { Card } from "./Card";
import { SelectMenu } from "./SelectMenu";
import { useDialogStore } from "../store/dialogStore";

type TransferFilter =
  | "all"
  | "available"
  | "pending"
  | "accepted"
  | "rejected"
  | "expired"
  | "image"
  | "video"
  | "audio"
  | "file";

type TransferSortMode =
  | "newest"
  | "oldest"
  | "name"
  | "largest"
  | "smallest"
  | "expiring";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getTransferPreviewType(mimeType: string) {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

function getDeviceName(devices: Device[], deviceId?: string | null) {
  if (!deviceId) return null;

  return (
    devices.find((device) => device.id === deviceId)?.name ?? "Unknown device"
  );
}

function isTransferExpired(transfer: Transfer) {
  return Date.now() >= new Date(transfer.expires_at).getTime();
}

function isTransferDownloadable(transfer: Transfer) {
  return (
    !isTransferExpired(transfer) &&
    (transfer.status === "available" || transfer.status === "accepted")
  );
}

function canCurrentDeviceReviewTransfer(
  transfer: Transfer,
  currentDeviceId?: string,
) {
  return (
    !isTransferExpired(transfer) &&
    transfer.status === "pending" &&
    Boolean(currentDeviceId) &&
    transfer.target_device_id === currentDeviceId
  );
}

function formatTransferStatus(transfer: Transfer) {
  if (isTransferExpired(transfer)) return "Expired";

  return formatStatusLabel(transfer.status);
}

function formatStatusLabel(status: TransferStatus) {
  switch (status) {
    case "available":
      return "Available";
    case "pending":
      return "Pending";
    case "accepted":
      return "Accepted";
    case "rejected":
      return "Rejected";
  }
}

function TransferPreview({ transfer }: { transfer: Transfer }) {
  const canPreview = isTransferDownloadable(transfer);
  const previewType = getTransferPreviewType(transfer.mime_type);
  const { data: url } = useQuery({
    queryKey: ["transfer-download-url", transfer.id],
    queryFn: () => createTransferDownloadUrl(transfer.id),
    enabled: canPreview && (previewType === "image" || previewType === "video"),
    staleTime: 4 * 60 * 1000,
  });

  if (canPreview && previewType === "image" && url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="block h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white"
      >
        <img
          className="h-full w-full object-cover"
          src={url}
          alt={transfer.filename}
          loading="lazy"
        />
      </a>
    );
  }

  if (canPreview && previewType === "video" && url) {
    return (
      <video
        className="h-14 w-14 shrink-0 rounded-xl bg-black object-cover"
        src={url}
        preload="metadata"
        muted
      />
    );
  }

  const PreviewIcon =
    previewType === "image"
      ? ImageIcon
      : previewType === "video"
        ? Film
        : previewType === "audio"
          ? Music2
          : File;

  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white text-neutral-400">
      <PreviewIcon size={20} />
    </div>
  );
}

function TransferAudio({ transfer }: { transfer: Transfer }) {
  const { data: url } = useQuery({
    queryKey: ["transfer-download-url", transfer.id],
    queryFn: () => createTransferDownloadUrl(transfer.id),
    staleTime: 4 * 60 * 1000,
  });
  if (!url) return null;
  return (
    <audio
      className="mt-2 h-8 w-full"
      src={url}
      controls
      preload="metadata"
    />
  );
}

function triggerDownload(url: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.rel = "noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function formatRelativeTime(value: string) {
  const difference = new Date(value).getTime() - Date.now();
  const absoluteDifference = Math.abs(difference);
  const units = [
    { milliseconds: 24 * 60 * 60 * 1000, label: "d" },
    { milliseconds: 60 * 60 * 1000, label: "h" },
    { milliseconds: 60 * 1000, label: "m" },
  ];
  const unit = units.find(({ milliseconds }) => absoluteDifference >= milliseconds);
  const amount = unit ? Math.max(1, Math.round(absoluteDifference / unit.milliseconds)) : 1;
  const label = unit?.label ?? "m";

  return difference >= 0 ? `in ${amount}${label}` : `${amount}${label} ago`;
}

function formatFileType(transfer: Transfer) {
  const extension = transfer.filename.split(".").pop();
  if (extension && extension !== transfer.filename && extension.length <= 6) {
    return extension.toUpperCase();
  }

  return getTransferPreviewType(transfer.mime_type).toUpperCase();
}

function transferStatusClass(transfer: Transfer) {
  if (isTransferExpired(transfer) || transfer.status === "rejected") {
    return "bg-red-50 text-red-700";
  }
  if (transfer.status === "pending") return "bg-amber-50 text-amber-800";
  return "bg-emerald-50 text-emerald-700";
}

export function TransferList() {
  const initialTransferLimit = isTauriRuntime() ? 3 : 5;
  const queryClient = useQueryClient();
  const currentDevice = useDeviceStore((state) => state.device);
  const addToast = useToastStore((state) => state.addToast);
  const confirm = useDialogStore((state) => state.confirm);
  const sectionRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TransferFilter>("all");
  const [sortMode, setSortMode] = useState<TransferSortMode>("newest");
  const [transferLimit, setTransferLimit] = useState(initialTransferLimit);

  useEffect(() => {
    setTransferLimit(initialTransferLimit);
  }, [initialTransferLimit, searchQuery, statusFilter, sortMode]);

  const { data: transfers = [] } = useQuery({
    queryKey: ["transfers"],
    queryFn: listTransfers,
  });

  const { data: devices = [] } = useQuery({
    queryKey: ["devices"],
    queryFn: listDevices,
  });

  const { data: config } = useQuery({
    queryKey: ["config", currentDevice?.id],
    queryFn: () => getConfig(currentDevice?.id),
  });

  const remove = useMutation({
    mutationFn: deleteTransfer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      addToast({ type: "success", message: "Transfer deleted." });
    },
    onError: () => {
      addToast({ type: "error", message: "Could not delete transfer." });
    },
  });

  const removeAll = useMutation({
    mutationFn: deleteAllTransfers,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      addToast({ type: "success", message: "All transfers deleted." });
    },
    onError: () => {
      addToast({ type: "error", message: "Could not delete all transfers." });
    },
  });

  const accept = useMutation({
    mutationFn: acceptTransfer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      addToast({ type: "success", message: "Transfer accepted." });
    },
    onError: () => {
      addToast({ type: "error", message: "Could not accept transfer." });
    },
  });

  const reject = useMutation({
    mutationFn: rejectTransfer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      addToast({ type: "info", message: "Transfer rejected." });
    },
    onError: () => {
      addToast({ type: "error", message: "Could not reject transfer." });
    },
  });

  const visibleTransfers = transfers;

  const filteredTransfers = useMemo(
    () =>
      sortTransfers(
        filterTransfers({
          transfers: visibleTransfers,
          devices,
          searchQuery,
          statusFilter,
        }),
        sortMode,
      ),
    [visibleTransfers, devices, searchQuery, statusFilter, sortMode],
  );

  const downloadableTransfers = filteredTransfers.filter(
    isTransferDownloadable,
  );
  const hasTransfers = visibleTransfers.length > 0;
  const hasFilteredTransfers = filteredTransfers.length > 0;
  const hasDownloadableTransfers = downloadableTransfers.length > 0;
  const canDeleteAllTransfers = Boolean(config?.is_host_device) && hasTransfers;
  const displayedTransfers = filteredTransfers.slice(0, transferLimit);
  const remainingTransferCount = Math.max(
    0,
    filteredTransfers.length - displayedTransfers.length,
  );
  const nextTransferCount = Math.min(
    initialTransferLimit,
    remainingTransferCount,
  );
  const canCollapseTransfers =
    transferLimit > initialTransferLimit &&
    filteredTransfers.length > initialTransferLimit;

  function collapseTransfers() {
    setTransferLimit(initialTransferLimit);
    window.requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <Card>
      <div ref={sectionRef} className="min-w-0 scroll-mt-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">
              Transfers
              <span className="ml-1.5 text-xs font-medium text-neutral-400">
                · {visibleTransfers.length}
              </span>
            </h2>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto]">
              <input
                className="col-span-2 min-w-0 rounded-xl border border-neutral-300 px-3 py-2 text-xs outline-none focus:border-neutral-900 sm:col-span-1"
                placeholder="Search transfers..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />

              <SelectMenu
                value={statusFilter}
                onChange={setStatusFilter}
                ariaLabel="Filter transfers"
                options={[
                  { value: "all", label: "All" },
                  { value: "available", label: "Available" },
                  { value: "pending", label: "Pending" },
                  { value: "accepted", label: "Accepted" },
                  { value: "rejected", label: "Rejected" },
                  { value: "expired", label: "Expired" },
                  { value: "image", label: "Images" },
                  { value: "video", label: "Videos" },
                  { value: "audio", label: "Audio" },
                  { value: "file", label: "Files" },
                ] satisfies { value: TransferFilter; label: string }[]}
              />

              <SelectMenu
                value={sortMode}
                onChange={setSortMode}
                ariaLabel="Sort transfers"
                options={[
                  { value: "newest", label: "Newest" },
                  { value: "oldest", label: "Oldest" },
                  { value: "name", label: "Name A-Z" },
                  { value: "largest", label: "Largest" },
                  { value: "smallest", label: "Smallest" },
                  { value: "expiring", label: "Expiring soon" },
                ] satisfies { value: TransferSortMode; label: string }[]}
              />
            </div>

            {hasTransfers && (
              <p className="mt-1.5 text-xs text-neutral-500">
                {filteredTransfers.length} of {visibleTransfers.length} visible
              </p>
            )}
          </div>

          {hasTransfers && (
            <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-row">
              {hasDownloadableTransfers && (
                <button
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl bg-neutral-900 px-3 py-2 text-center text-xs font-medium text-white ${
                    canDeleteAllTransfers ? "" : "col-span-2"
                  }`}
                  type="button"
                  onClick={async () =>
                    triggerDownload(await createDownloadAllTransfersUrl())
                  }
                >
                  <Archive size={13} />
                  Download ZIP
                </button>
              )}

              {canDeleteAllTransfers && (
                <button
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-center text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 ${
                    hasDownloadableTransfers ? "" : "col-span-2"
                  }`}
                  type="button"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Delete all transfers?",
                        description:
                          "Every transfer and its stored file will be permanently deleted.",
                        confirmLabel: "Delete all",
                        tone: "danger",
                      })
                    ) removeAll.mutate();
                  }}
                  disabled={removeAll.isPending}
                >
                  <Trash2 size={13} />
                  {removeAll.isPending ? "Deleting..." : "Delete all"}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 space-y-2">
          {!hasTransfers ? (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-3 py-3">
              <div className="rounded-lg bg-white p-2 text-neutral-400">
                <FileStack size={16} />
              </div>
              <div>
                <p className="text-xs font-semibold text-neutral-800">No transfers yet</p>
                <p className="mt-0.5 text-[11px] text-neutral-500">
                  Drop files above to make them available.
                </p>
              </div>
            </div>
          ) : !hasFilteredTransfers ? (
            <div className="rounded-xl bg-neutral-50 px-3 py-4 text-center">
              <p className="text-xs font-semibold text-neutral-800">No matching transfers</p>
              <p className="mt-1 text-[11px] text-neutral-500">
                Try a different search or filter.
              </p>
            </div>
          ) : (
            displayedTransfers.map((transfer) => {
              const senderName = getDeviceName(
                devices,
                transfer.sender_device_id,
              );
              const targetName = getDeviceName(
                devices,
                transfer.target_device_id,
              );
              const canReview = canCurrentDeviceReviewTransfer(
                transfer,
                currentDevice?.id,
              );
              const canDownload = isTransferDownloadable(transfer);
              const canDelete =
                Boolean(config?.is_host_device) ||
                transfer.sender_device_id === currentDevice?.id;

              return (
                <div
                  key={transfer.id}
                  className="min-w-0 overflow-hidden rounded-xl bg-neutral-50 p-2.5"
                >
                  <div className="flex min-w-0 items-start gap-2.5">
                    <TransferPreview transfer={transfer} />

                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p
                        className="truncate text-xs font-semibold text-neutral-900"
                        title={transfer.filename}
                      >
                        {transfer.filename}
                      </p>

                      <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                        {formatBytes(transfer.size)} · {formatFileType(transfer)}
                      </p>

                      <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[10px]">
                        <span
                          className="min-w-0 flex-1 truncate text-neutral-500"
                          title={`${senderName ?? "Unknown"} to ${targetName ?? "Everyone"}`}
                        >
                          {senderName ?? "Unknown"} → {targetName ?? "Everyone"}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${transferStatusClass(transfer)}`}
                        >
                          {formatTransferStatus(transfer)}
                        </span>
                      </div>

                      <p
                        className="mt-1.5 truncate text-[10px] text-neutral-400"
                        title={`Uploaded ${new Date(transfer.created_at).toLocaleString()} · Expires ${new Date(transfer.expires_at).toLocaleString()}`}
                      >
                        Uploaded {formatRelativeTime(transfer.created_at)} · Expires{" "}
                        {formatRelativeTime(transfer.expires_at)}
                      </p>
                    </div>
                  </div>

                  {canDownload &&
                    getTransferPreviewType(transfer.mime_type) === "audio" && (
                      <TransferAudio transfer={transfer} />
                    )}

                  <div className="mt-2 flex shrink-0 flex-wrap justify-end gap-1.5 border-t border-neutral-200/70 pt-2">
                    {canReview && (
                      <>
                        <button
                          className="rounded-lg bg-neutral-900 px-2.5 py-1.5 text-[11px] font-medium text-white"
                          type="button"
                          onClick={() => accept.mutate(transfer.id)}
                          disabled={accept.isPending || reject.isPending}
                        >
                          Accept
                        </button>

                        <button
                          className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-[11px] font-medium text-neutral-700"
                          type="button"
                          onClick={() => reject.mutate(transfer.id)}
                          disabled={accept.isPending || reject.isPending}
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {canDownload && (
                      <button
                        className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-2.5 py-1.5 text-[11px] font-medium text-white"
                        type="button"
                        onClick={async () =>
                          triggerDownload(
                            await createTransferDownloadUrl(transfer.id),
                          )
                        }
                      >
                        <Download size={12} />
                        Download
                      </button>
                    )}

                    {canDelete && (
                      <button
                        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-[11px] font-medium text-neutral-700 hover:bg-white"
                        type="button"
                        onClick={() => remove.mutate(transfer.id)}
                        disabled={remove.isPending}
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {hasFilteredTransfers &&
          (remainingTransferCount > 0 || canCollapseTransfers) && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 pt-3">
              <p className="text-[11px] text-neutral-500" aria-live="polite">
                Showing {displayedTransfers.length} of {filteredTransfers.length}
              </p>

              <div className="flex items-center gap-2">
                {canCollapseTransfers && (
                  <button
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                    type="button"
                    onClick={collapseTransfers}
                  >
                    <ChevronUp size={13} /> Collapse list
                  </button>
                )}

                {remainingTransferCount > 0 && (
                  <button
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-neutral-950 px-3 py-2 text-xs font-medium text-white"
                    type="button"
                    onClick={() =>
                      setTransferLimit((current) =>
                        Math.min(
                          current + initialTransferLimit,
                          filteredTransfers.length,
                        ),
                      )
                    }
                  >
                    <ChevronDown size={13} /> Show {nextTransferCount} more
                  </button>
                )}
              </div>
            </div>
          )}
      </div>
    </Card>
  );
}

function filterTransfers({
  transfers,
  devices,
  searchQuery,
  statusFilter,
}: {
  transfers: Transfer[];
  devices: Device[];
  searchQuery: string;
  statusFilter: TransferFilter;
}) {
  const normalizedSearch = searchQuery.trim().toLowerCase();

  return transfers.filter((transfer) => {
    if (!matchesTransferFilter(transfer, statusFilter)) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    const senderName = getDeviceName(devices, transfer.sender_device_id) ?? "";
    const targetName = getDeviceName(devices, transfer.target_device_id) ?? "";

    return [
      transfer.filename,
      transfer.mime_type,
      senderName,
      targetName,
      formatTransferStatus(transfer),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedSearch);
  });
}

function matchesTransferFilter(transfer: Transfer, filter: TransferFilter) {
  if (filter === "all") return true;
  if (filter === "expired") return isTransferExpired(transfer);

  if (filter === "image" || filter === "video" || filter === "audio") {
    return getTransferPreviewType(transfer.mime_type) === filter;
  }

  if (filter === "file") {
    return getTransferPreviewType(transfer.mime_type) === "file";
  }

  return !isTransferExpired(transfer) && transfer.status === filter;
}

function sortTransfers(transfers: Transfer[], sortMode: TransferSortMode) {
  return [...transfers].sort((first, second) => {
    switch (sortMode) {
      case "oldest":
        return (
          new Date(first.created_at).getTime() -
          new Date(second.created_at).getTime()
        );

      case "name":
        return first.filename.localeCompare(second.filename);

      case "largest":
        return second.size - first.size;

      case "smallest":
        return first.size - second.size;

      case "expiring":
        return (
          new Date(first.expires_at).getTime() -
          new Date(second.expires_at).getTime()
        );

      case "newest":
      default:
        return (
          new Date(second.created_at).getTime() -
          new Date(first.created_at).getTime()
        );
    }
  });
}
