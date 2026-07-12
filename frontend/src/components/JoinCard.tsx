import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Eye, EyeOff, QrCode, X } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { getConfig } from "../api/config";
import { useDeviceStore } from "../store/deviceStore";
import { Card } from "./Card";
import { isTauriRuntime } from "../api/client";

export function JoinCard() {
  const [copied, setCopied] = useState(false);
  const [showPin, setShowPin] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  const device = useDeviceStore((state) => state.device);

  const { data: config } = useQuery({
    queryKey: ["config", device?.id],
    queryFn: () => getConfig(device?.id),
  });

  const browserOrigin = useMemo(() => {
    if (isTauriRuntime()) {
      return "http://127.0.0.1:18080";
    }

    return window.location.origin;
  }, []);

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

  useEffect(() => {
    if (!showInvite) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setShowInvite(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showInvite]);

  if (device) {
    return (
      <>
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-neutral-900">
                Invite another device
              </p>
              <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                {joinUrl}
              </p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-neutral-300 px-2.5 py-2 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50"
                onClick={copyJoinUrl}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-neutral-950 px-2.5 py-2 text-[11px] font-medium text-white hover:bg-neutral-800"
                onClick={() => setShowInvite(true)}
              >
                <QrCode size={13} /> Invite
              </button>
            </div>
          </div>
        </Card>

        {showInvite && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950/55 p-4 backdrop-blur-sm"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setShowInvite(false);
            }}
          >
            <section
              className="w-full max-w-sm rounded-3xl border border-neutral-200 bg-white p-5 text-neutral-950 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="invite-dialog-title"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-neutral-400">
                    Join this den
                  </p>
                  <h2 id="invite-dialog-title" className="mt-1 text-lg font-semibold">
                    Invite another device
                  </h2>
                </div>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
                  onClick={() => setShowInvite(false)}
                  aria-label="Close invite dialog"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mx-auto mt-4 w-fit rounded-2xl border border-neutral-200 bg-white p-3">
                <QRCodeCanvas value={joinUrl} size={148} />
              </div>

              <code className="mt-4 block truncate rounded-xl bg-neutral-100 px-3 py-2.5 text-center text-xs text-neutral-800">
                {joinUrl}
              </code>

              {isHostDevice && (
                <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400">
                        Join PIN
                      </p>
                      <p className="mt-1 font-mono text-xl font-semibold tracking-[0.22em]">
                        {visiblePin}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg border border-neutral-300 p-2 text-neutral-600 hover:bg-white"
                      onClick={() => setShowPin((value) => !value)}
                      aria-label={showPin ? "Hide join PIN" : "Show join PIN"}
                    >
                      {showPin ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-950 px-3 py-2.5 text-xs font-medium text-white"
                onClick={copyJoinUrl}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Join link copied" : "Copy join link"}
              </button>
            </section>
          </div>
        )}
      </>
    );
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-neutral-500">
            Join this den
          </p>

          <h2 className="mt-1 text-lg font-semibold">
            Open from another device
          </h2>

          <p className="mt-1 max-w-xl text-xs leading-5 text-neutral-600">
            Use the same Wi-Fi or local network. Scan the QR code or open this
            address in another browser.
          </p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-neutral-100 px-3 py-2 text-xs text-neutral-800">
              {joinUrl}
            </code>

            <button
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-neutral-900 px-3 py-2 text-xs font-medium text-white"
              type="button"
              onClick={copyJoinUrl}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          {joinUrl.includes("localhost") && config?.mode !== "desktop" && (
            <p className="mt-3 text-xs text-amber-700">
              This device is using localhost. To join from another device, open
              Drop Den using your computer&apos;s LAN IP address instead.
            </p>
          )}

          <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
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
                <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.25em] text-neutral-900">
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

        <div className="w-fit rounded-2xl border border-neutral-200 bg-white p-2">
          <QRCodeCanvas value={joinUrl} size={112} />
        </div>
      </div>
    </Card>
  );
}
