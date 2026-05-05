import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { registerDevice } from "../api/devices";
import { useDeviceStore } from "../store/deviceStore";
import { Card } from "./Card";

export function DeviceSetup() {
  const queryClient = useQueryClient();
  const { device, setDevice } = useDeviceStore();
  const [name, setName] = useState(() => localStorage.getItem("drop-den-device-name") ?? "");

  const mutation = useMutation({
    mutationFn: registerDevice,
    onSuccess: (newDevice) => {
      localStorage.setItem("drop-den-device-name", newDevice.name);
      setDevice(newDevice);
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    mutation.mutate(trimmed);
  }

  return (
    <Card>
      <h2 className="text-xl font-semibold">Your device</h2>
      {device ? (
        <p className="mt-2 text-sm text-neutral-600">
          Connected as <span className="font-semibold text-neutral-900">{device.name}</span>
        </p>
      ) : (
        <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={onSubmit}>
          <input
            className="min-w-0 flex-1 rounded-2xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-900"
            placeholder="e.g. Elijah's phone"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button className="rounded-2xl bg-neutral-900 px-5 py-3 font-medium text-white" type="submit">
            Join
          </button>
        </form>
      )}
    </Card>
  );
}
