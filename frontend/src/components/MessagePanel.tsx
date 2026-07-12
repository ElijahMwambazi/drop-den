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

type MessagePanelProps = {
  embedded?: boolean;
};

export function MessagePanel({ embedded = false }: MessagePanelProps) {
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
    mutationFn: (messageBody: string) => createMessage(messageBody),
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

  const content = (
    <>
      {!embedded && (
        <div className="mb-3">
          <h2 className="text-base font-semibold">Messages</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Send short local notes to connected devices.
          </p>
        </div>
      )}

      <div className="mt-3 max-h-80 min-h-20 space-y-2 overflow-y-auto rounded-2xl bg-neutral-50 p-2">
        {messages.length === 0 ? (
          <div className="flex min-h-16 items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-white p-3 text-center">
            <p className="max-w-sm text-sm text-neutral-500">
              No messages yet. Send a note below.
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
                    "max-w-[88%] rounded-2xl px-3 py-2 shadow-sm",
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

                  <p className="whitespace-pre-wrap wrap-break-word text-xs leading-5">
                    {message.body}
                  </p>
                </div>
              </div>
            );
          })
        )}

        <div ref={bottomRef} />
      </div>

      <form className="mt-3 flex gap-2" onSubmit={onSubmit}>
        <textarea
          className="min-h-10 min-w-0 flex-1 resize-none rounded-xl border border-neutral-300 px-3 py-2 text-xs outline-none focus:border-neutral-900"
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
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-neutral-900 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={!device || !canSend}
        >
          <Send size={14} />
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
    </>
  );

  if (embedded) {
    return content;
  }

  return <Card>{content}</Card>;
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
