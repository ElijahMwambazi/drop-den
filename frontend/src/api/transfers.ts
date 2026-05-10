import { deleteRequest, getJson } from "./client";
import type { Transfer } from "../types";

type UploadTransferOptions = {
  senderDeviceId?: string;
  targetDeviceId?: string;
  onProgress?: (progress: number) => void;
};

export function listTransfers() {
  return getJson<Transfer[]>("/api/transfers");
}

export function uploadTransfer(
  file: File,
  options: UploadTransferOptions = {},
) {
  const formData = new FormData();

  formData.append("file", file);

  if (options.senderDeviceId) {
    formData.append("sender_device_id", options.senderDeviceId);
  }

  if (options.targetDeviceId) {
    formData.append("target_device_id", options.targetDeviceId);
  }

  return new Promise<Transfer>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open("POST", "/api/transfers/upload");

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;

      const progress = Math.round((event.loaded / event.total) * 100);
      options.onProgress?.(progress);
    };

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        options.onProgress?.(100);
        resolve(JSON.parse(request.responseText) as Transfer);
        return;
      }

      reject(new Error(`Upload failed: ${request.status}`));
    };

    request.onerror = () => {
      reject(new Error("Upload failed: network error"));
    };

    request.send(formData);
  });
}

export function acceptTransfer(id: string) {
  return updateTransferStatus(id, "accept");
}

export function rejectTransfer(id: string) {
  return updateTransferStatus(id, "reject");
}

export function deleteTransfer(id: string) {
  return deleteRequest(`/api/transfers/${id}`);
}

export function transferDownloadUrl(id: string) {
  return `/api/transfers/${id}/download`;
}

export function downloadAllTransfersUrl() {
  return "/api/transfers/download-all";
}

async function updateTransferStatus(id: string, action: "accept" | "reject") {
  const response = await fetch(`/api/transfers/${id}/${action}`, {
    method: "PATCH",
  });

  if (!response.ok) {
    throw new Error(`Could not ${action} transfer: ${response.status}`);
  }

  return response.json() as Promise<Transfer>;
}
