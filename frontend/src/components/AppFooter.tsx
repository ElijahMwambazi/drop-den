import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  Download,
  FileStack,
  MessageSquare,
  Shield,
  Users,
} from "lucide-react";
import { getConfig } from "../api/config";
import { isTauriRuntime } from "../api/client";
import { listDevices } from "../api/devices";
import { listMessages } from "../api/messages";
import { listTransfers } from "../api/transfers";
import { useDeviceStore } from "../store/deviceStore";
import type { Transfer } from "../types";

function isTransferExpired(transfer: Transfer) {
  return Date.now() >= new Date(transfer.expires_at).getTime();
}

function isTransferDownloadable(transfer: Transfer) {
  return (
    !isTransferExpired(transfer) &&
    (transfer.status === "available" || transfer.status === "accepted")
  );
}

export function AppFooter() {
  const isDesktopRuntime = isTauriRuntime();
  const device = useDeviceStore((state) => state.device);
  const canFetchPrivateData = isDesktopRuntime && Boolean(device);

  const { data: devices = [] } = useQuery({
    queryKey: ["devices"],
    queryFn: listDevices,
    enabled: canFetchPrivateData,
  });

  const { data: transfers = [] } = useQuery({
    queryKey: ["transfers"],
    queryFn: listTransfers,
    enabled: canFetchPrivateData,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["messages"],
    queryFn: listMessages,
    enabled: canFetchPrivateData,
  });

  const { data: config } = useQuery({
    queryKey: ["config", device?.id],
    queryFn: () => getConfig(device?.id),
    enabled: canFetchPrivateData,
  });

  if (!isDesktopRuntime) return null;

  const downloadableTransfers = transfers.filter(
    isTransferDownloadable,
  ).length;
  const role = !device
    ? "Not joined"
    : config?.is_host_device
      ? "Host"
      : "Joined";

  return (
    <footer className="z-40 flex shrink-0 items-center justify-center gap-1.5 overflow-x-auto border-t border-neutral-800 bg-neutral-950 px-3 py-1.5 text-[11px] text-neutral-300">
      <FooterStat icon={<Users size={12} />} label="Devices" value={devices.length} />
      <FooterStat
        icon={<FileStack size={12} />}
        label="Transfers"
        value={transfers.length}
      />
      <FooterStat
        icon={<Download size={12} />}
        label="Ready"
        value={downloadableTransfers}
      />
      <FooterStat
        icon={<MessageSquare size={12} />}
        label="Messages"
        value={messages.length}
      />
      <FooterStat icon={<Shield size={12} />} label="Role" value={role} />
    </footer>
  );
}

function FooterStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/5 px-2 py-1"
      title={`${label}: ${value}`}
    >
      <span className="text-neutral-400">{icon}</span>
      <span className="hidden text-neutral-400 sm:inline">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}
