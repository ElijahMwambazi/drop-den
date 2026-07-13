import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown } from "lucide-react";
import { getConfig } from "../api/config";
import { leaveDevice, registerDevice } from "../api/devices";
import { useDeviceStore } from "../store/deviceStore";
import { Card } from "./Card";
import { useToastStore } from "../store/toastStore";
import { ApiError, isTauriRuntime } from "../api/client";
import { JoinPinInput } from "./JoinPinInput";

export function DeviceSetup() {
  const queryClient = useQueryClient();
  const { device, setDevice, clearDevice } = useDeviceStore();
  const addToast = useToastStore((state) => state.addToast);

  const nameSuggestions = useMemo(getDeviceNameSuggestions, []);
  const [name, setName] = useState(() =>
    device?.name ??
    localStorage.getItem("drop-den-device-name") ??
    nameSuggestions[0] ??
    "This device",
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
  const leaveMutation = useMutation({
    mutationFn: async () => {
      if (!device) return;
      await leaveDevice(device.id);
    },
    onSuccess: () => {
      clearDevice();
      setName(nameSuggestions[0] ?? "This device");
      setJoinPin("");
      queryClient.removeQueries({ queryKey: ["devices"] });
      queryClient.removeQueries({ queryKey: ["transfers"] });
      queryClient.removeQueries({ queryKey: ["messages"] });
      queryClient.invalidateQueries({ queryKey: ["config"] });
      addToast({ type: "info", message: "This device left the den." });
    },
    onError: (error) => {
      if (error instanceof ApiError && [401, 404].includes(error.status)) {
        clearDevice();
        queryClient.removeQueries({ queryKey: ["devices"] });
        queryClient.removeQueries({ queryKey: ["transfers"] });
        queryClient.removeQueries({ queryKey: ["messages"] });
        queryClient.invalidateQueries({ queryKey: ["config"] });
        addToast({
          type: "info",
          message: "The saved identity was already disconnected and has been cleared.",
        });
        return;
      }

      addToast({
        type: "error",
        message: "Could not leave the den. Check the connection and try again.",
      });
    },
  });
  const joinError = getJoinError(mutation.error, requiresPin);

  function onSubmit(event: FormEvent) {
    event.preventDefault();

    const trimmedName = name.trim();
    const trimmedJoinPin = joinPin.trim();

    if (!trimmedName) {
      return;
    }

    if (requiresPin && trimmedJoinPin.length !== 6) {
      return;
    }

    mutation.mutate({
      name: trimmedName,
      joinPin: requiresPin ? trimmedJoinPin : undefined,
    });
  }

  function onSwitchDevice() {
    if (isHostDevice) {
      addToast({
        type: "info",
        message: "This device is host. Reset its identity from Host settings first.",
      });
      return;
    }

    leaveMutation.mutate();
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Your device</h2>

          {device ? (
            <div className="mt-1 space-y-1 text-xs text-neutral-600">
              <p>
                Connected as{" "}
                <span className="font-semibold text-neutral-900">
                  {device.name}
                </span>
              </p>
              <p className="mt-1 text-xs leading-5 text-neutral-600">
                {isHostDevice
                  ? "This device manages membership and den-wide maintenance."
                  : "This device can send and receive files and messages in this den."}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-neutral-600">
              {hasHostDevice
                ? "Choose a recognizable name, then enter the six-digit PIN shown on the host."
                : "Set up this device as host. You can invite other devices after it connects."}
            </p>
          )}
        </div>

        {device && (
          <button
            className="rounded-xl border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            onClick={onSwitchDevice}
            disabled={isHostDevice || leaveMutation.isPending}
            title={
              isHostDevice
                ? "Reset the host identity from Host settings before switching."
                : undefined
            }
          >
            {leaveMutation.isPending ? "Leaving…" : "Leave den"}
          </button>
        )}
      </div>

      {!device && config && !hasHostDevice && (
        <div className="mt-3 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-amber-900">
          <Crown className="mt-0.5 shrink-0" size={16} />
          <div>
            <p className="text-xs font-semibold">This den needs a host</p>
            <p className="mt-1 text-xs leading-5 text-amber-800">
              No host is assigned right now. This device can become host from
              the browser or desktop app and create a fresh join PIN.
            </p>
          </div>
        </div>
      )}

      {!device && (
        <form className="mt-4 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="text-xs font-medium text-neutral-700" htmlFor="device-name">
              Device name
            </label>
            <input
              id="device-name"
              className="mt-1.5 w-full min-w-0 rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-neutral-900"
              placeholder="e.g. Living-room laptop"
              value={name}
              autoComplete="off"
              onChange={(event) => {
                setName(event.target.value);
                mutation.reset();
              }}
            />
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Suggested device names">
              {nameSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900"
                  onClick={() => {
                    setName(suggestion);
                    mutation.reset();
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          {requiresPin && (
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label className="text-xs font-medium text-neutral-700">Join PIN</label>
                <span className="text-[11px] text-neutral-400">6 digits</span>
              </div>
              <JoinPinInput
                value={joinPin}
                onChange={(value) => {
                  setJoinPin(value);
                  mutation.reset();
                }}
                disabled={mutation.isPending}
                invalid={mutation.isError}
              />
            </div>
          )}

          <button
            className="w-full rounded-xl bg-neutral-900 px-3 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            type="submit"
            disabled={
              mutation.isPending ||
              !name.trim() ||
              (requiresPin && joinPin.length !== 6)
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
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5" role="alert">
          <p className="text-xs font-semibold text-red-800">Couldn’t connect this device</p>
          <p className="mt-1 text-xs leading-5 text-red-700">{joinError}</p>
        </div>
      )}
    </Card>
  );
}

function getJoinError(error: unknown, requiresPin: boolean) {
  if (error instanceof ApiError) {
    if (error.status === 401 && requiresPin) {
      return "That PIN didn’t match. Check the current PIN on the host and try again.";
    }
    if (error.status === 400) {
      return "Check the device name and PIN, then try again.";
    }
    if (error.status >= 500) {
      return "The Drop Den host could not finish setup. Try again in a moment.";
    }
  }

  return "The host could not be reached. Make sure both devices are on the same network and try again.";
}

function getDeviceNameSuggestions() {
  const userAgent = navigator.userAgent;
  const browser = /firefox/i.test(userAgent)
    ? "Firefox"
    : /edg/i.test(userAgent)
      ? "Edge"
      : /chrome|crios/i.test(userAgent)
        ? "Chrome"
        : /safari/i.test(userAgent)
          ? "Safari"
          : "Browser";

  const deviceType = isTauriRuntime()
    ? "Desktop app"
    : /android/i.test(userAgent)
      ? /mobile/i.test(userAgent)
        ? "Android phone"
        : "Android tablet"
      : /iphone/i.test(userAgent)
        ? "iPhone"
        : /ipad/i.test(userAgent)
          ? "iPad"
          : /windows/i.test(userAgent)
            ? "Windows computer"
            : /macintosh|mac os/i.test(userAgent)
              ? "Mac"
              : /linux/i.test(userAgent)
                ? "Linux computer"
                : "This device";

  return [...new Set([deviceType, `${browser} on this device`, "Personal device"])];
}
