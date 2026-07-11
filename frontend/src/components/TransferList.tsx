import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getConfig } from "../api/config";
import { listDevices } from "../api/devices";
import {
  acceptTransfer,
  deleteAllTransfers,
  deleteTransfer,
  downloadAllTransfersUrl,
  listTransfers,
  rejectTransfer,
  transferDownloadUrl,
} from "../api/transfers";
import { useDeviceStore } from "../store/deviceStore";
import { useToastStore } from "../store/toastStore";
import type { Device, Transfer, TransferStatus } from "../types";
import { Card } from "./Card";

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

function isTransferVisibleToDevice(
  transfer: Transfer,
  currentDeviceId?: string,
) {
  if (!transfer.target_device_id) return true;
  if (!currentDeviceId) return false;

  return (
    transfer.target_device_id === currentDeviceId ||
    transfer.sender_device_id === currentDeviceId
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

  if (!canPreview) {
    return (
      <div className="flex h-20 w-full items-center justify-center rounded-xl bg-white text-xs font-medium text-neutral-500 sm:w-24">
        {formatTransferStatus(transfer)}
      </div>
    );
  }

  const previewType = getTransferPreviewType(transfer.mime_type);
  const url = transferDownloadUrl(transfer.id);

  if (previewType === "image") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="block w-full shrink-0 sm:w-32"
      >
        <img
          className="h-28 w-full rounded-xl object-cover sm:h-20 sm:w-24"
          src={url}
          alt={transfer.filename}
          loading="lazy"
        />
      </a>
    );
  }

  if (previewType === "video") {
    return (
      <video
        className="h-28 w-full max-w-full rounded-xl bg-black object-cover sm:h-20 sm:w-24"
        src={url}
        controls
        preload="metadata"
      />
    );
  }

  if (previewType === "audio") {
    return (
      <div className="min-w-0 max-w-full rounded-xl bg-white p-2 sm:w-64">
        <audio
          className="w-full max-w-full"
          src={url}
          controls
          preload="metadata"
        />
      </div>
    );
  }

  return (
    <div className="flex h-20 w-full items-center justify-center rounded-xl bg-white text-xs font-medium text-neutral-500 sm:w-24">
      File
    </div>
  );
}

export function TransferList() {
  const queryClient = useQueryClient();
  const currentDevice = useDeviceStore((state) => state.device);
  const addToast = useToastStore((state) => state.addToast);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TransferFilter>("all");
  const [sortMode, setSortMode] = useState<TransferSortMode>("newest");

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

  const visibleTransfers = useMemo(
    () =>
      transfers.filter((transfer) =>
        isTransferVisibleToDevice(transfer, currentDevice?.id),
      ),
    [transfers, currentDevice?.id],
  );

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

  return (
    <Card>
      <div className="min-w-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Transfers</h2>

            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <input
                className="min-w-0 rounded-xl border border-neutral-300 px-3 py-2 text-xs outline-none focus:border-neutral-900"
                placeholder="Search transfers..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />

              <select
                className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs outline-none focus:border-neutral-900"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as TransferFilter)
                }
              >
                <option value="all">All</option>
                <option value="available">Available</option>
                <option value="pending">Pending</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
                <option value="expired">Expired</option>
                <option value="image">Images</option>
                <option value="video">Videos</option>
                <option value="audio">Audio</option>
                <option value="file">Files</option>
              </select>

              <select
                className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs outline-none focus:border-neutral-900"
                value={sortMode}
                onChange={(event) =>
                  setSortMode(event.target.value as TransferSortMode)
                }
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="name">Name A-Z</option>
                <option value="largest">Largest</option>
                <option value="smallest">Smallest</option>
                <option value="expiring">Expiring soon</option>
              </select>
            </div>

            <p className="mt-0.5 text-xs text-neutral-500">
              {hasTransfers
                ? `${filteredTransfers.length} of ${visibleTransfers.length} visible ${
                    visibleTransfers.length === 1 ? "file" : "files"
                  }`
                : "No files visible for this device."}
            </p>
          </div>

          {hasTransfers && (
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              {hasDownloadableTransfers && (
                <a
                  className="rounded-xl bg-neutral-900 px-3 py-2 text-center text-xs font-medium text-white"
                  href={downloadAllTransfersUrl()}
                >
                  Download ZIP
                </a>
              )}

              {canDeleteAllTransfers && (
                <button
                  className="rounded-xl border border-red-200 px-3 py-2 text-center text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={() => {
                    if (window.confirm("Delete all transfers from this den?")) {
                      removeAll.mutate();
                    }
                  }}
                  disabled={removeAll.isPending}
                >
                  {removeAll.isPending ? "Deleting..." : "Delete all"}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 space-y-2">
          {!hasTransfers ? (
            <p className="text-sm text-neutral-500">
              Upload files to make them available to nearby devices.
            </p>
          ) : (
            visibleTransfers.map((transfer) => {
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

              return (
                <div
                  key={transfer.id}
                  className="grid min-w-0 gap-3 overflow-hidden rounded-xl bg-neutral-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="grid min-w-0 gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                    <TransferPreview transfer={transfer} />

                    <div className="min-w-0 overflow-hidden">
                      <p className="truncate text-sm font-medium">
                        {transfer.filename}
                      </p>

                      <p className="mt-0.5 truncate text-xs text-neutral-500">
                        {formatBytes(transfer.size)} · {transfer.mime_type}
                      </p>

                      <div className="mt-1.5 flex min-w-0 flex-wrap gap-1.5 text-[11px]">
                        <span className="max-w-full truncate rounded-full bg-white px-2 py-0.5 text-neutral-600">
                          From {senderName ?? "unknown"}
                        </span>

                        <span className="max-w-full truncate rounded-full bg-white px-2 py-0.5 text-neutral-600">
                          To {targetName ?? "everyone"}
                        </span>

                        <span className="rounded-full bg-white px-2 py-0.5 text-neutral-600">
                          {formatTransferStatus(transfer)}
                        </span>
                      </div>

                      <p className="mt-1.5 truncate text-[11px] text-neutral-400">
                        Uploaded{" "}
                        {new Date(transfer.created_at).toLocaleString()}
                      </p>

                      <p className="mt-1.5 truncate text-[11px] text-neutral-400">
                        Expires {new Date(transfer.expires_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                    {canReview && (
                      <>
                        <button
                          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white"
                          type="button"
                          onClick={() => accept.mutate(transfer.id)}
                          disabled={accept.isPending || reject.isPending}
                        >
                          Accept
                        </button>

                        <button
                          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white"
                          type="button"
                          onClick={() => reject.mutate(transfer.id)}
                          disabled={accept.isPending || reject.isPending}
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {canDownload && (
                      <a
                        className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-medium text-white"
                        href={transferDownloadUrl(transfer.id)}
                      >
                        Download
                      </a>
                    )}

                    <button
                      className="rounded-xl border border-neutral-300 px-3 py-2 text-xs font-medium"
                      type="button"
                      onClick={() => remove.mutate(transfer.id)}
                      disabled={remove.isPending}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
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
