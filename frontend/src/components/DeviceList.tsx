import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getConfig } from "../api/config";
import { listDevices, removeDevice } from "../api/devices";
import { useDeviceStore } from "../store/deviceStore";
import { useToastStore } from "../store/toastStore";
import { Card } from "./Card";

export function DeviceList() {
  const queryClient = useQueryClient();
  const currentDevice = useDeviceStore((state) => state.device);
  const addToast = useToastStore((state) => state.addToast);

  const { data: devices = [] } = useQuery({
    queryKey: ["devices"],
    queryFn: listDevices,
  });

  const { data: config } = useQuery({
    queryKey: ["config", currentDevice?.id],
    queryFn: () => getConfig(currentDevice?.id),
  });

  const remove = useMutation({
    mutationFn: (deviceId: string) => {
      if (!currentDevice?.id) {
        throw new Error("No current device identity.");
      }

      return removeDevice(deviceId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });

      addToast({
        type: "success",
        message: "Device removed.",
      });
    },
    onError: () => {
      addToast({
        type: "error",
        message: "Could not remove device.",
      });
    },
  });

  const isHostDevice = Boolean(config?.is_host_device);

  return (
    <Card>
      <h2 className="text-base font-semibold">Connected devices</h2>

      <div className="mt-3 space-y-2">
        {devices.length === 0 ? (
          <p className="text-sm text-neutral-500">No devices registered yet.</p>
        ) : (
          devices.map((device) => {
            const isCurrentDevice = device.id === currentDevice?.id;
            const canRemoveDevice = isHostDevice && !isCurrentDevice;

            return (
              <div
                key={device.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-neutral-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {device.name}
                    </p>

                    {isCurrentDevice && (
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-neutral-500">
                        You
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-xs text-neutral-500">
                    {new Date(device.connected_at).toLocaleString()}
                  </p>
                </div>

                {canRemoveDevice && (
                  <button
                    className="shrink-0 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(`Remove ${device.name} from this den?`)
                      ) {
                        remove.mutate(device.id);
                      }
                    }}
                    disabled={remove.isPending}
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
