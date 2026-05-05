import { getJson, postJson } from "./client";
import type { LocalMessage } from "../types";

export function listMessages() {
  return getJson<LocalMessage[]>("/api/messages");
}

export function createMessage(body: string, senderDeviceId?: string) {
  return postJson<LocalMessage, { body: string; sender_device_id?: string }>("/api/messages", {
    body,
    sender_device_id: senderDeviceId,
  });
}
