import { deleteRequest, getJson, postJson } from "./client";
import type { LocalMessage } from "../types";

export function listMessages() {
  return getJson<LocalMessage[]>("/api/messages");
}

export function createMessage(body: string) {
  return postJson<LocalMessage, { body: string }>("/api/messages", {
    body,
  });
}

export function clearMessages() {
  return deleteRequest("/api/messages");
}
