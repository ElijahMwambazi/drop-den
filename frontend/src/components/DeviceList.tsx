import { useQuery } from "@tanstack/react-query";
import { listDevices } from "../api/devices";
import { Card } from "./Card";

export function DeviceList() {
  const { data = [] } = useQuery({ queryKey: ["devices"], queryFn: listDevices });

  return (
    <Card>
      <h2 className="text-xl font-semibold">Connected devices</h2>
      <div className="mt-4 space-y-2">
        {data.length === 0 ? (
          <p className="text-sm text-neutral-500">No devices registered yet.</p>
        ) : (
          data.map((device) => (
            <div key={device.id} className="rounded-2xl bg-neutral-50 px-4 py-3">
              <p className="font-medium">{device.name}</p>
              <p className="text-xs text-neutral-500">{new Date(device.connected_at).toLocaleString()}</p>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
