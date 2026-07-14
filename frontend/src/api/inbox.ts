import { deleteRequest, getJson } from "./client";
import type { InboxItem } from "../types";

export function listInboxItems() {
  return getJson<InboxItem[]>("/api/inbox");
}

export function deleteInboxItem(id: string) {
  return deleteRequest(`/api/inbox/${id}`);
}

export function clearInbox() {
  return deleteRequest("/api/inbox");
}
