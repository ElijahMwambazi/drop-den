import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileStack } from "lucide-react";
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
  const confirm = useDialogStore((state) => state.confirm);

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
            filteredTransfers.map((transfer) => {
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
