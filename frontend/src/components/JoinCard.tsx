import { QRCodeCanvas } from "qrcode.react";
import { Card } from "./Card";

export function JoinCard() {
  const joinUrl = window.location.origin;

  return (
    <Card>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-neutral-500">Join this den</p>
          <h2 className="mt-1 text-2xl font-semibold">Open from another device</h2>
          <p className="mt-2 max-w-xl text-sm text-neutral-600">
            Use the same Wi-Fi or local network. Scan the QR code or open this address in a browser.
          </p>
          <code className="mt-4 block rounded-2xl bg-neutral-100 p-3 text-sm text-neutral-800">{joinUrl}</code>
        </div>
        <div className="rounded-3xl border border-neutral-200 bg-white p-3">
          <QRCodeCanvas value={joinUrl} size={156} />
        </div>
      </div>
    </Card>
  );
}
