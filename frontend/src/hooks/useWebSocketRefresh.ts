import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDeviceStore } from "../store/deviceStore";
import { useToastStore } from "../store/toastStore";
import type { Device, Transfer, WsEvent } from "../types";

export function useWebSocketRefresh() {
  const queryClient = useQueryClient();
  const addToast = useToastStore((state) => state.addToast);
  const currentDevice = useDeviceStore((state) => state.device);
  const clearDevice = useDeviceStore((state) => state.clearDevice);

  useEffect(() => {
    let shouldShowDisconnectToast = true;

    const socket = new WebSocket(getWebSocketUrl());

    socket.onopen = () => {
      shouldShowDisconnectToast = true;
    };

    socket.onmessage = (event) => {
      const wsEvent = parseWsEvent(event.data);

      queryClient.invalidateQueries({ queryKey: ["devices"] });
      queryClient.invalidateQueries({ queryKey: ["config"] });
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      queryClient.invalidateQueries({ queryKey: ["messages"] });

      if (!wsEvent) return;

      handleWebSocketToast(wsEvent, currentDevice?.id, addToast, clearDevice);
    };

    socket.onerror = () => {
      // Do not toast here. Browser WebSocket errors are noisy and often fire
      // during reloads, hot reloads, sleep/wake, or normal teardown.
    };

    socket.onclose = () => {
      if (!shouldShowDisconnectToast) return;

      addToast({
        type: "error",
        message: "Live connection lost.",
      });
    };

    return () => {
      shouldShowDisconnectToast = false;
      socket.close();
    };
  }, [addToast, clearDevice, currentDevice?.id, queryClient]);
}

function getWebSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";

  if (window.location.port === "5173") {
    return `${protocol}://${window.location.hostname}:8080/ws`;
  }

  return `${protocol}://${window.location.host}/ws`;
}

function handleWebSocketToast(
  wsEvent: WsEvent,
  currentDeviceId: string | undefined,
  addToast: (toast: {
    type: "success" | "error" | "info";
    message: string;
  }) => void,
  clearDevice: () => void,
) {
  if (wsEvent.event_type === "device_registered") {
    const device = wsEvent.payload as Device;

    if (device.id === currentDeviceId) {
      return;
    }

    addToast({
      type: "info",
      message: `${device.name} joined the den.`,
    });

    return;
  }

  if (wsEvent.event_type === "device_removed") {
    const device = wsEvent.payload as Device;

    if (device.id === currentDeviceId) {
      clearDevice();

      addToast({
        type: "error",
        message: "This device was removed from the den.",
      });

      return;
    }

    addToast({
      type: "info",
      message: `${device.name} was removed from the den.`,
    });

    return;
  }

  if (wsEvent.event_type === "message_created") {
    addToast({
      type: "info",
      message: "New message received.",
    });

    return;
  }

  if (wsEvent.event_type === "transfer_created") {
    const transfer = wsEvent.payload as Transfer;

    if (transfer.sender_device_id === currentDeviceId) {
      return;
    }

    if (
      transfer.target_device_id &&
      transfer.target_device_id !== currentDeviceId
    ) {
      return;
    }

    addToast({
      type: "info",
      message: transfer.target_device_id
        ? "New file sent to you."
        : "New file shared in the den.",
    });

    return;
  }

  if (wsEvent.event_type === "transfer_updated") {
    const transfer = wsEvent.payload as Transfer;

    if (
      transfer.sender_device_id !== currentDeviceId &&
      transfer.target_device_id !== currentDeviceId
    ) {
      return;
    }

    addToast({
      type: "info",
      message: `Transfer ${formatTransferStatus(transfer.status)}.`,
    });

    return;
  }

  if (wsEvent.event_type === "transfer_deleted") {
    const transfer = wsEvent.payload as Transfer;

    const isBroadcastTransfer = !transfer.target_device_id;
    const isRelatedToCurrentDevice =
      transfer.sender_device_id === currentDeviceId ||
      transfer.target_device_id === currentDeviceId;

    if (!isBroadcastTransfer && !isRelatedToCurrentDevice) {
      return;
    }

    addToast({
      type: "info",
      message: "Transfer deleted.",
    });
  }
}

function parseWsEvent(value: unknown): WsEvent | null {
  if (typeof value !== "string") return null;

  try {
    return JSON.parse(value) as WsEvent;
  } catch {
    return null;
  }
}

function formatTransferStatus(status: Transfer["status"]) {
  switch (status) {
    case "available":
      return "available";
    case "pending":
      return "pending";
    case "accepted":
      return "accepted";
    case "rejected":
      return "rejected";
  }
}
