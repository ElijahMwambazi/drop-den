import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getConfig } from "../api/config";
import { registerDevice } from "../api/devices";
import { useDeviceStore } from "../store/deviceStore";
import { Card } from "./Card";

export function DeviceSetup() {
  const queryClient = useQueryClient();
  const { device, setDevice, clearDevice } = useDeviceStore();

  const [name, setName] = useState(
    () => device?.name ?? localStorage.getItem("drop-den-device-name") ?? "",
  );
  const [joinPin, setJoinPin] = useState("");

  const { data: config } = useQuery({
    queryKey: ["config", device?.id],
    queryFn: () => getConfig(device?.id),
  });

  const hasHostDevice = Boolean(config?.has_host_device);
  const isHostDevice = Boolean(config?.is_host_device);
  const requiresPin = hasHostDevice && !device;

  const mutation = useMutation({
    mutationFn: registerDevice,
    onSuccess: (newDevice) => {
      setDevice(newDevice);
      setJoinPin("");
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      queryClient.invalidateQueries({ queryKey: ["config"] });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();

    const trimmedName = name.trim();
    const trimmedJoinPin = joinPin.trim();

    if (!trimmedName) {
      return;
    }

    if (requiresPin && !trimmedJoinPin) {
      return;
    }

    mutation.mutate({
      name: trimmedName,
      joinPin: requiresPin ? trimmedJoinPin : undefined,
    });
  }

  function onSwitchDevice() {
    clearDevice();
    setName("");
    setJoinPin("");
    queryClient.invalidateQueries({ queryKey: ["config"] });
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
                {isHostDevice
                  ? "This is the host device. The join PIN is visible here by default."
                  : "This is a joined device. The join PIN is hidden from this browser."}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-neutral-600">
              {hasHostDevice
                ? "Name this device and enter the host join PIN."
                : "Name this first device to start the den as host."}
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
          className={
            requiresPin
              ? "mt-4 grid gap-3 sm:grid-cols-[1fr_180px_auto]"
              : "mt-4 flex flex-col gap-3 sm:flex-row"
          }
          onSubmit={onSubmit}
        >
          <input
            className="min-w-0 rounded-2xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-900 sm:flex-1"
            placeholder="e.g. Elijah's laptop"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />

          {requiresPin && (
            <input
              className="min-w-0 rounded-2xl border border-neutral-300 px-4 py-3 font-mono tracking-[0.2em] outline-none focus:border-neutral-900"
              inputMode="numeric"
              maxLength={6}
              placeholder="PIN"
              value={joinPin}
              onChange={(event) =>
                setJoinPin(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
            />
          )}

          <button
            className="rounded-2xl bg-neutral-900 px-5 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={
              mutation.isPending ||
              !name.trim() ||
              (requiresPin && !joinPin.trim())
            }
          >
            {mutation.isPending
              ? "Joining..."
              : requiresPin
                ? "Join"
                : "Start as host"}
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
