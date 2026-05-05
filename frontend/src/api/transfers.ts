import { deleteRequest, getJson } from "./client";
import type { Transfer } from "../types";

export function listTransfers() {
  return getJson<Transfer[]>("/api/transfers");
}

export async function uploadTransfer(file: File, senderDeviceId?: string) {
  const formData = new FormData();
  formData.append("file", file);
  if (senderDeviceId) formData.append("sender_device_id", senderDeviceId);

  const response = await fetch("/api/transfers/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }

  return response.json() as Promise<Transfer>;
}

export function deleteTransfer(id: string) {
  return deleteRequest(`/api/transfers/${id}`);
}

export function transferDownloadUrl(id: string) {
  return `/api/transfers/${id}/download`;
}
