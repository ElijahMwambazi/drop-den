import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createMessage, listMessages } from "../api/messages";
import { useDeviceStore } from "../store/deviceStore";
import { Card } from "./Card";

export function MessagePanel() {
  const queryClient = useQueryClient();
  const device = useDeviceStore((state) => state.device);
  const [body, setBody] = useState("");
  const { data = [] } = useQuery({ queryKey: ["messages"], queryFn: listMessages });

  const mutation = useMutation({
    mutationFn: (messageBody: string) => createMessage(messageBody, device?.id),
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    mutation.mutate(trimmed);
  }

  return (
    <Card>
      <h2 className="text-xl font-semibold">Messages</h2>
      <form className="mt-4 flex gap-2" onSubmit={onSubmit}>
        <input
          className="min-w-0 flex-1 rounded-2xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-900"
          placeholder="Send a local message..."
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <button className="rounded-2xl bg-neutral-900 px-5 py-3 font-medium text-white" type="submit">
          Send
        </button>
      </form>
      <div className="mt-4 space-y-2">
        {data.length === 0 ? (
          <p className="text-sm text-neutral-500">No messages yet.</p>
        ) : (
          data.map((message) => (
            <div key={message.id} className="rounded-2xl bg-neutral-50 px-4 py-3">
              <p>{message.body}</p>
              <p className="mt-1 text-xs text-neutral-500">{new Date(message.created_at).toLocaleString()}</p>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
