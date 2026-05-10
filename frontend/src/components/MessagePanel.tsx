import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { listDevices } from "../api/devices";
import { createMessage, listMessages } from "../api/messages";
import { useDeviceStore } from "../store/deviceStore";
import type { Device } from "../types";
import { Card } from "./Card";

export function MessagePanel() {
  const queryClient = useQueryClient();
  const device = useDeviceStore((state) => state.device);
  const [body, setBody] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { data: messages = [] } = useQuery({
    queryKey: ["messages"],
    queryFn: listMessages,
  });

  const { data: devices = [] } = useQuery({
    queryKey: ["devices"],
    queryFn: listDevices,
  });

  const deviceNameById = useMemo(() => {
    return devices.reduce<Record<string, string>>((names, currentDevice) => {
      names[currentDevice.id] = currentDevice.name;
      return names;
    }, {});
  }, [devices]);

  const mutation = useMutation({
    mutationFn: (messageBody: string) => createMessage(messageBody, device?.id),
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    sendMessage();
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    sendMessage();
  }

  function sendMessage() {
    const trimmed = body.trim();

    if (!trimmed || mutation.isPending) {
      return;
    }

    mutation.mutate(trimmed);
  }

  const canSend = Boolean(body.trim()) && !mutation.isPending;

  return (
    <Card>
      <div className="flex min-w-0 flex-col">
        <div>
          <h2 className="text-xl font-semibold">Messages</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Send short local notes to everyone connected to this den.
          </p>
        </div>

        <div className="mt-4 max-h-[26rem] min-h-40 space-y-3 overflow-y-auto rounded-3xl bg-neutral-50 p-3">
          {messages.length === 0 ? (
            <div className="flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white p-6 text-center">
              <p className="max-w-sm text-sm text-neutral-500">
                No messages yet. Send a note to everyone in the den.
              </p>
            </div>
          ) : (
            messages.map((message) => {
              const isOwnMessage = message.sender_device_id === device?.id;
              const senderName = getSenderName(
                devices,
                deviceNameById,
                message.sender_device_id,
                isOwnMessage,
              );

              return (
                <div
                  key={message.id}
                  className={[
                    "flex min-w-0",
                    isOwnMessage ? "justify-end" : "justify-start",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "max-w-[85%] rounded-3xl px-4 py-3 shadow-sm",
                      isOwnMessage
                        ? "bg-neutral-900 text-white"
                        : "border border-neutral-200 bg-white text-neutral-900",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs",
                        isOwnMessage ? "text-neutral-300" : "text-neutral-500",
                      ].join(" ")}
                    >
                      <span className="font-medium">{senderName}</span>
                      <span>·</span>
                      <time dateTime={message.created_at}>
                        {formatMessageTime(message.created_at)}
                      </time>
                    </div>

                    <p className="whitespace-pre-wrap break-words text-sm leading-6">
                      {message.body}
                    </p>
                  </div>
                </div>
              );
            })
          )}

          <div ref={bottomRef} />
        </div>

        <form className="mt-4 flex gap-2" onSubmit={onSubmit}>
          <textarea
            className="min-h-12 min-w-0 flex-1 resize-none rounded-2xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-900"
            placeholder={
              device
                ? "Send a local message..."
                : "Join as a device before sending..."
            }
            rows={1}
            value={body}
            disabled={!device || mutation.isPending}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={onInputKeyDown}
          />

          <button
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-neutral-900 px-5 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={!device || !canSend}
          >
            <Send size={16} />
            {mutation.isPending ? "Sending" : "Send"}
          </button>
        </form>

        <p className="mt-2 text-xs text-neutral-500">
          Press Enter to send. Use Shift + Enter for a new line.
        </p>

        {mutation.isError && (
          <p className="mt-2 text-sm text-red-600">
            {mutation.error instanceof Error
              ? mutation.error.message
              : "Could not send message."}
          </p>
        )}
      </div>
    </Card>
  );
}

function getSenderName(
  devices: Device[],
  deviceNameById: Record<string, string>,
  senderDeviceId: string | null | undefined,
  isOwnMessage: boolean,
) {
  if (isOwnMessage) return "You";
  if (!senderDeviceId) return "Unknown device";

  return (
    deviceNameById[senderDeviceId] ??
    devices.find((device) => device.id === senderDeviceId)?.name ??
    "Unknown device"
  );
}

function formatMessageTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
