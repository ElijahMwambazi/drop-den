import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listDevices } from "../api/devices";
import {
  acceptTransfer,
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
      <div className="flex h-24 w-full items-center justify-center rounded-2xl bg-white text-sm font-medium text-neutral-500 sm:w-32">
        {formatTransferStatus(transfer)}
      </div>
    );
  }

  const previewType = getTransferPreviewType(transfer.mime_type);
  const url = transferDownloadUrl(transfer.id);

  if (previewType === "image") {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img
          className="h-40 w-full rounded-2xl object-cover sm:h-24 sm:w-32"
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
        className="h-40 w-full rounded-2xl bg-black object-cover sm:h-24 sm:w-32"
        src={url}
        controls
        preload="metadata"
      />
    );
  }

  if (previewType === "audio") {
    return (
      <div className="w-full rounded-2xl bg-white p-3 sm:w-72">
        <audio className="w-full" src={url} controls preload="metadata" />
      </div>
    );
  }

  return (
    <div className="flex h-24 w-full items-center justify-center rounded-2xl bg-white text-sm font-medium text-neutral-500 sm:w-32">
      File
    </div>
  );
}

export function TransferList() {
  const queryClient = useQueryClient();
  const currentDevice = useDeviceStore((state) => state.device);
  const addToast = useToastStore((state) => state.addToast);

  const { data: transfers = [] } = useQuery({
    queryKey: ["transfers"],
    queryFn: listTransfers,
  });

  const { data: devices = [] } = useQuery({
    queryKey: ["devices"],
    queryFn: listDevices,
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

  const visibleTransfers = transfers.filter((transfer) =>
    isTransferVisibleToDevice(transfer, currentDevice?.id),
  );

  const downloadableTransfers = visibleTransfers.filter(isTransferDownloadable);
  const hasTransfers = visibleTransfers.length > 0;
  const hasDownloadableTransfers = downloadableTransfers.length > 0;

  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Transfers</h2>
          <p className="mt-1 text-sm text-neutral-500">
            {hasTransfers
              ? `${visibleTransfers.length} visible ${
                  visibleTransfers.length === 1 ? "file" : "files"
                }`
              : "No files visible for this device."}
          </p>
        </div>

        {hasDownloadableTransfers && (
          <a
            className="rounded-xl bg-neutral-900 px-4 py-2 text-center text-sm font-medium text-white"
            href={downloadAllTransfersUrl()}
          >
            Download ZIP
          </a>
        )}
      </div>

      <div className="mt-4 space-y-3">
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
                className="flex flex-col gap-4 rounded-2xl bg-neutral-50 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-center">
                  <TransferPreview transfer={transfer} />

                  <div className="min-w-0">
                    <p className="truncate font-medium">{transfer.filename}</p>

                    <p className="mt-1 text-sm text-neutral-500">
                      {formatBytes(transfer.size)} · {transfer.mime_type}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-white px-3 py-1 text-neutral-600">
                        From {senderName ?? "unknown"}
                      </span>

                      <span className="rounded-full bg-white px-3 py-1 text-neutral-600">
                        To {targetName ?? "everyone"}
                      </span>

                      <span className="rounded-full bg-white px-3 py-1 text-neutral-600">
                        {formatTransferStatus(transfer)}
                      </span>
                    </div>

                    <p className="mt-2 text-xs text-neutral-400">
                      Uploaded {new Date(transfer.created_at).toLocaleString()}
                    </p>

                    <p className="mt-1 text-xs text-neutral-400">
                      Expires {new Date(transfer.expires_at).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  {canReview && (
                    <>
                      <button
                        className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
                        type="button"
                        onClick={() => accept.mutate(transfer.id)}
                        disabled={accept.isPending || reject.isPending}
                      >
                        Accept
                      </button>

                      <button
                        className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium"
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
                      className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
                      href={transferDownloadUrl(transfer.id)}
                    >
                      Download
                    </a>
                  )}

                  <button
                    className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium"
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
    </Card>
  );
}
