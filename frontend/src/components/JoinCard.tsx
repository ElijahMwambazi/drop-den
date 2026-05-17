import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { getConfig } from "../api/config";
import { useDeviceStore } from "../store/deviceStore";
import { Card } from "./Card";

export function JoinCard() {
  const [copied, setCopied] = useState(false);
  const [showPin, setShowPin] = useState(true);

  const device = useDeviceStore((state) => state.device);

  const { data: config } = useQuery({
    queryKey: ["config", device?.id],
    queryFn: () => getConfig(device?.id),
  });

  const browserOrigin = useMemo(() => window.location.origin, []);
  const joinUrl = config?.recommended_join_origin ?? browserOrigin;

  async function copyJoinUrl() {
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);

    window.setTimeout(() => {
      setCopied(false);
    }, 1500);
  }

  const isHostDevice = Boolean(config?.is_host_device);
  const hasHostDevice = Boolean(config?.has_host_device);
  const visiblePin = config?.join_pin && showPin ? config.join_pin : "••••••";

  return (
    <Card>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium uppercase tracking-wide text-neutral-500">
            Join this den
          </p>

          <h2 className="mt-1 text-2xl font-semibold">
            Open from another device
          </h2>

          <p className="mt-2 max-w-xl text-sm text-neutral-600">
            Use the same Wi-Fi or local network. Scan the QR code or open this
            address in another browser.
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-2xl bg-neutral-100 p-3 text-sm text-neutral-800">
              {joinUrl}
            </code>

            <button
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white"
              type="button"
              onClick={copyJoinUrl}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          {joinUrl.includes("localhost") && (
            <p className="mt-3 text-xs text-amber-700">
              This device is using localhost because a LAN IP could not be
              detected. To join from another device, open Drop Den using your
              computer&apos;s LAN IP address instead.
            </p>
          )}

          <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Device role
                </p>
                <p className="mt-1 text-sm font-semibold text-neutral-900">
                  {!device
                    ? hasHostDevice
                      ? "Not joined"
                      : "No host yet"
                    : isHostDevice
                      ? "Host device"
                      : "Joined device"}
                </p>
              </div>

              {isHostDevice && (
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-white"
                  type="button"
                  onClick={() => setShowPin((value) => !value)}
                >
                  {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                  {showPin ? "Hide PIN" : "Show PIN"}
                </button>
              )}
            </div>

            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Join PIN
              </p>

              {isHostDevice ? (
                <p className="mt-1 font-mono text-3xl font-semibold tracking-[0.25em] text-neutral-900">
                  {visiblePin}
                </p>
              ) : (
                <p className="mt-1 text-sm text-neutral-600">
                  {hasHostDevice
                    ? "PIN is only visible on the host device."
                    : "Register this first device to become the host and reveal the PIN."}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="w-fit rounded-3xl border border-neutral-200 bg-white p-3">
          <QRCodeCanvas value={joinUrl} size={156} />
        </div>
      </div>
    </Card>
  );
}
