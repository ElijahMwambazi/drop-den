import {
  DEVICE_ID_HEADER,
  apiUrl,
  currentDeviceQuery,
  deleteRequest,
  getJson,
  patchJson,
  postJson,
} from "./client";
import { useDeviceStore } from "../store/deviceStore";
import type { Transfer } from "../types";

type UploadTransferOptions = {
  senderDeviceId?: string;
  targetDeviceId?: string;
  onProgress?: (progress: number) => void;
};

type UploadLocalPathsOptions = {
  senderDeviceId?: string;
  targetDeviceId?: string;
};

export function listTransfers() {
  return getJson<Transfer[]>("/api/transfers");
}

export function uploadTransfer(
  file: File,
  options: UploadTransferOptions = {},
) {
  const formData = new FormData();

  const senderDeviceId =
    useDeviceStore.getState().device?.id ?? options.senderDeviceId;

  if (senderDeviceId) {
    formData.append("sender_device_id", senderDeviceId);
  }

  if (options.targetDeviceId) {
    formData.append("target_device_id", options.targetDeviceId);
  }

  formData.append("file", file);

  return new Promise<Transfer>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open("POST", apiUrl("/api/transfers/upload"));

    if (senderDeviceId) {
      request.setRequestHeader(DEVICE_ID_HEADER, senderDeviceId);
    }

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

export function uploadLocalPaths(
  paths: string[],
  options: UploadLocalPathsOptions = {},
) {
  const senderDeviceId =
    useDeviceStore.getState().device?.id ?? options.senderDeviceId;

  return postJson<Transfer[], unknown>("/api/transfers/upload-local-paths", {
    sender_device_id: senderDeviceId,
    target_device_id: options.targetDeviceId || undefined,
    paths,
  });
}

export function acceptTransfer(id: string) {
  return patchJson<Transfer>(`/api/transfers/${id}/accept`);
}

export function rejectTransfer(id: string) {
  return patchJson<Transfer>(`/api/transfers/${id}/reject`);
}

export function deleteTransfer(id: string) {
  return deleteRequest(`/api/transfers/${id}`);
}

export function deleteAllTransfers() {
  return deleteRequest("/api/transfers");
}

export function transferDownloadUrl(id: string) {
  const query = currentDeviceQuery();
  const path = query
    ? `/api/transfers/${id}/download?${query}`
    : `/api/transfers/${id}/download`;

  return apiUrl(path);
}

export function downloadAllTransfersUrl() {
  const query = currentDeviceQuery();
  const path = query
    ? `/api/transfers/download-all?${query}`
    : "/api/transfers/download-all";

  return apiUrl(path);
}
