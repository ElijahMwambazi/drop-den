import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { registerDevice } from "../api/devices";
import { useDeviceStore } from "../store/deviceStore";
import { Card } from "./Card";

export function DeviceSetup() {
  const queryClient = useQueryClient();
  const { device, setDevice, clearDevice } = useDeviceStore();

  const [name, setName] = useState(
    () => device?.name ?? localStorage.getItem("drop-den-device-name") ?? "",
  );

  const mutation = useMutation({
    mutationFn: registerDevice,
    onSuccess: (newDevice) => {
      setDevice(newDevice);
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();

    const trimmed = name.trim();

    if (!trimmed) {
      return;
    }

    mutation.mutate(trimmed);
  }

  function onSwitchDevice() {
    clearDevice();
    setName("");
  }

  return (
    <Card>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Your device</h2>

          {device ? (
            <div className="mt-2 space-y-1 text-sm text-neutral-600">
              <p>
                Connected as{" "}
                <span className="font-semibold text-neutral-900">
                  {device.name}
                </span>
              </p>
              <p className="text-xs text-neutral-500">
                This identity is saved in this browser.
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-neutral-600">
              Name this device so other nearby devices can recognize it.
            </p>
          )}
        </div>

        {device && (
          <button
            className="rounded-2xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            type="button"
            onClick={onSwitchDevice}
          >
            Switch device
          </button>
        )}
      </div>

      {!device && (
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row"
          onSubmit={onSubmit}
        >
          <input
            className="min-w-0 flex-1 rounded-2xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-900"
            placeholder="e.g. Elijah's phone"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />

          <button
            className="rounded-2xl bg-neutral-900 px-5 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Joining..." : "Join"}
          </button>
        </form>
      )}

      {mutation.isError && (
        <p className="mt-3 text-sm text-red-600">
          {mutation.error instanceof Error
            ? mutation.error.message
            : "Could not register this device."}
        </p>
      )}
    </Card>
  );
}
