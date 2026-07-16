import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Radio,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { getConfig } from "../api/config";
import { listDevices } from "../api/devices";
import { uploadLocalPaths, uploadTransfer } from "../api/transfers";
import { useDeviceStore } from "../store/deviceStore";
import { useToastStore } from "../store/toastStore";
import { Card } from "./Card";
import { isTauriRuntime } from "../api/client";
import { SelectMenu } from "./SelectMenu";

type UploadStatus = "queued" | "uploading" | "success" | "error";

type UploadItem = {
  id: string;
  file: File;
  localPath?: string;
  size: number | null;
  progress: number;
  status: UploadStatus;
  error?: string;
};

type NativeShareItem = {
  id: string;
  name: string;
  size: number | null;
  status: UploadStatus;
  error?: string | null;
  retryable: boolean;
};

declare global {
  interface Window {
    __DROP_DEN_NATIVE_SHARE_QUEUE__?: NativeShareItem[];
  }
}

type TauriDragDropEvent = {
  payload:
    | {
        type: "enter" | "over" | "leave";
        position?: {
          x: number;
          y: number;
        };
      }
    | {
        type: "drop";
        paths: string[];
        position?: {
          x: number;
          y: number;
        };
      };
};

export function FileUpload() {
  const queryClient = useQueryClient();
  const device = useDeviceStore((state) => state.device);
  const addToast = useToastStore((state) => state.addToast);

  const { data: devices = [] } = useQuery({
    queryKey: ["devices"],
    queryFn: listDevices,
  });

  const { data: config } = useQuery({
    queryKey: ["config", device?.id],
    queryFn: () => getConfig(device?.id),
  });

  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [nativeShareQueue, setNativeShareQueue] = useState<NativeShareItem[]>(
    () => window.__DROP_DEN_NATIVE_SHARE_QUEUE__ ?? [],
  );
  const [isDragging, setIsDragging] = useState(false);
  const [targetDeviceId, setTargetDeviceId] = useState("");

  const lastDesktopDropSignatureRef = useRef("");
  const lastDesktopDropTimeRef = useRef(0);
  const nativeQueueWasVisibleRef = useRef(false);
  const deviceIdRef = useRef(device?.id);
  const targetDeviceIdRef = useRef(targetDeviceId);

  const maxUploadSizeBytes = config?.max_upload_size_bytes ?? 250 * 1024 * 1024;
  const transferTtlSeconds =
    config?.default_transfer_ttl_seconds ?? 24 * 60 * 60;

  const targetDevices = devices.filter(
    (targetDevice) => targetDevice.id !== device?.id,
  );

  const isUploading = uploads.some(
    (upload) => upload.status === "queued" || upload.status === "uploading",
  );
  const activeUploads = uploads.filter(
    (upload) => upload.status === "queued" || upload.status === "uploading",
  );
  const failedUploads = uploads.filter((upload) => upload.status === "error");
  const completedUploads = uploads.filter(
    (upload) => upload.status === "success",
  );
  const activeNativeShares = nativeShareQueue.filter(
    (item) => item.status === "queued" || item.status === "uploading",
  );
  const failedNativeShares = nativeShareQueue.filter(
    (item) => item.status === "error",
  );
  const completedNativeShares = nativeShareQueue.filter(
    (item) => item.status === "success",
  );
  const dismissibleNativeShares = failedNativeShares.filter(
    (item) => !item.retryable,
  );
  const hasRetryableFailure =
    failedUploads.length > 0 ||
    failedNativeShares.some((item) => item.retryable);
  const totalQueueItems = uploads.length + nativeShareQueue.length;
  const totalActiveUploads = activeUploads.length + activeNativeShares.length;
  const totalFailedUploads = failedUploads.length + failedNativeShares.length;
  const totalCompletedUploads =
    completedUploads.length + completedNativeShares.length;
  const batchProgress = uploads.length
    ? Math.round(
        uploads.reduce((total, upload) => total + upload.progress, 0) /
          uploads.length,
      )
    : 0;
  const completedUploadSignature = completedUploads
    .map((upload) => upload.id)
    .join(":");
  const completedNativeShareSignature = completedNativeShares
    .map((item) => item.id)
    .join(":");

  useEffect(() => {
    deviceIdRef.current = device?.id;
    targetDeviceIdRef.current = targetDeviceId;
  }, [device?.id, targetDeviceId]);

  useEffect(() => {
    if (!completedUploadSignature) return;

    const timeout = window.setTimeout(() => {
      setUploads((currentUploads) =>
        currentUploads.filter((upload) => upload.status !== "success"),
      );
    }, 8000);

    return () => window.clearTimeout(timeout);
  }, [completedUploadSignature]);

  useEffect(() => {
    function updateNativeShareQueue(event: Event) {
      const queue = (event as CustomEvent<NativeShareItem[]>).detail;
      if (Array.isArray(queue)) {
        setNativeShareQueue(queue);
      }
    }

    function refreshTransfers() {
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
    }

    window.addEventListener(
      "drop-den-native-share-queue",
      updateNativeShareQueue,
    );
    window.addEventListener(
      "drop-den-native-transfer-complete",
      refreshTransfers,
    );

    return () => {
      window.removeEventListener(
        "drop-den-native-share-queue",
        updateNativeShareQueue,
      );
      window.removeEventListener(
        "drop-den-native-transfer-complete",
        refreshTransfers,
      );
    };
  }, [queryClient]);

  useEffect(() => {
    if (!completedNativeShareSignature) return;

    queryClient.invalidateQueries({ queryKey: ["transfers"] });
    const timeout = window.setTimeout(() => {
      invokeNativeShareAction("clear-completed");
    }, 8000);

    return () => window.clearTimeout(timeout);
  }, [completedNativeShareSignature, queryClient]);

  useEffect(() => {
    if (nativeShareQueue.length === 0) {
      nativeQueueWasVisibleRef.current = false;
      return;
    }

    if (!nativeQueueWasVisibleRef.current) {
      nativeQueueWasVisibleRef.current = true;
      document
        .querySelector("[data-drop-den-share-target]")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [nativeShareQueue.length]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let unlisten: (() => void) | undefined;
    let isMounted = true;

    async function listenForTauriFileDrops() {
      try {
        const { getCurrentWebviewWindow } =
          await import("@tauri-apps/api/webviewWindow");

        unlisten = await getCurrentWebviewWindow().onDragDropEvent(
          (event: TauriDragDropEvent) => {
            if (
              event.payload.type === "enter" ||
              event.payload.type === "over"
            ) {
              setIsDragging(true);
              return;
            }

            if (event.payload.type === "leave") {
              setIsDragging(false);
              return;
            }

            if (event.payload.type === "drop") {
              setIsDragging(false);

              const paths = [...new Set(event.payload.paths ?? [])];

              if (paths.length === 0) {
                return;
              }

              if (shouldIgnoreDuplicateDesktopDrop(paths)) {
                return;
              }

              uploadDroppedLocalPaths(paths);
            }
          },
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : JSON.stringify(error);

        if (isMounted) {
          addToast({
            type: "error",
            message: `Desktop drag/drop unavailable: ${message}`,
          });
        }
      }
    }

    listenForTauriFileDrops();

    return () => {
      isMounted = false;
      unlisten?.();
    };
  }, []);

  function createLocalPathUploadItems(paths: string[]): UploadItem[] {
    return paths.map((path) => ({
      id: createUploadId(),
      file: createSyntheticFileFromPath(path),
      localPath: path,
      size: null,
      progress: 0,
      status: "queued",
    }));
  }

  function shouldIgnoreDuplicateDesktopDrop(paths: string[]) {
    const normalizedPaths = [...new Set(paths)].sort();
    const signature = normalizedPaths.join("\n");
    const now = Date.now();

    const isDuplicate =
      signature === lastDesktopDropSignatureRef.current &&
      now - lastDesktopDropTimeRef.current < 1500;

    lastDesktopDropSignatureRef.current = signature;
    lastDesktopDropTimeRef.current = now;

    return isDuplicate;
  }

  async function uploadDroppedLocalPaths(paths: string[]) {
    if (paths.length === 0) {
      return;
    }

    const uploadItems = createLocalPathUploadItems(paths);

    setUploads(uploadItems);
    setUploads((currentUploads) =>
      currentUploads.map((upload) => ({
        ...upload,
        status: "uploading",
        progress: 0,
      })),
    );

    try {
      const transfers = await uploadLocalPaths(paths, {
        senderDeviceId: deviceIdRef.current,
        targetDeviceId: targetDeviceIdRef.current || undefined,
      });

      setUploads((currentUploads) =>
        currentUploads.map((upload, index) => ({
          ...upload,
          size: transfers[index]?.size ?? upload.size,
          status: "success",
          progress: 100,
        })),
      );

      addToast({
        type: "success",
        message:
          transfers.length === 1
            ? `${transfers[0].filename} uploaded.`
            : `${transfers.length} files uploaded.`,
      });

      queryClient.invalidateQueries({ queryKey: ["transfers"] });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Dropped file upload failed.";

      setUploads((currentUploads) =>
        currentUploads.map((upload) => ({
          ...upload,
          status: "error",
          error: errorMessage,
        })),
      );

      addToast({
        type: "error",
        message: errorMessage,
      });
    }
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }

    const allowedFiles = files.filter(
      (file) => file.size <= maxUploadSizeBytes,
    );
    const blockedFiles = files.filter((file) => file.size > maxUploadSizeBytes);

    if (blockedFiles.length > 0) {
      addToast({
        type: "error",
        message:
          blockedFiles.length === 1
            ? `${blockedFiles[0].name} is larger than ${formatBytes(maxUploadSizeBytes)}.`
            : `${blockedFiles.length} files exceed the ${formatBytes(maxUploadSizeBytes)} limit.`,
      });
    }

    if (allowedFiles.length === 0) {
      return;
    }

    const uploadItems: UploadItem[] = allowedFiles.map((file) => ({
      id: createUploadId(),
      file,
      size: file.size,
      progress: 0,
      status: "queued",
    }));

    setUploads(uploadItems);
    let successCount = 0;
    let failureCount = 0;

    for (const uploadItem of uploadItems) {
      setUploads((currentUploads) =>
        currentUploads.map((item) =>
          item.id === uploadItem.id
            ? { ...item, status: "uploading", progress: 0 }
            : item,
        ),
      );

      try {
        await uploadTransfer(uploadItem.file, {
          senderDeviceId: device?.id,
          targetDeviceId: targetDeviceId || undefined,
          onProgress: (progress) => {
            setUploads((currentUploads) =>
              currentUploads.map((item) =>
                item.id === uploadItem.id ? { ...item, progress } : item,
              ),
            );
          },
        });

        setUploads((currentUploads) =>
          currentUploads.map((item) =>
            item.id === uploadItem.id
              ? { ...item, status: "success", progress: 100 }
              : item,
          ),
        );

        successCount += 1;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Upload failed.";

        setUploads((currentUploads) =>
          currentUploads.map((item) =>
            item.id === uploadItem.id
              ? {
                  ...item,
                  status: "error",
                  error: errorMessage,
                }
              : item,
          ),
        );

        failureCount += 1;
      }
    }

    queryClient.invalidateQueries({ queryKey: ["transfers"] });

    if (failureCount === 0) {
      addToast({
        type: "success",
        message:
          successCount === 1
            ? `${uploadItems[0].file.name} uploaded.`
            : `${successCount} files uploaded.`,
      });
    } else {
      addToast({
        type: "error",
        message:
          successCount > 0
            ? `${failureCount} of ${uploadItems.length} uploads failed. Review the upload queue.`
            : "Uploads failed. Review the upload queue and try again.",
      });
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    uploadFiles(files);
    event.target.value = "";
  }

  function onDragEnter(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (isTauriRuntime()) {
      return;
    }

    const hasFiles = Array.from(event.dataTransfer.types ?? []).includes(
      "Files",
    );

    if (hasFiles) {
      setIsDragging(true);
    }
  }

  function onDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (isTauriRuntime()) {
      return;
    }

    event.dataTransfer.dropEffect = "copy";

    const hasFiles = Array.from(event.dataTransfer.types ?? []).includes(
      "Files",
    );

    if (hasFiles) {
      setIsDragging(true);
    }
  }

  function onDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false);
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();

    setIsDragging(false);

    if (isTauriRuntime()) {
      return;
    }

    const files = Array.from(event.dataTransfer.files ?? []);

    uploadFiles(files);
  }

  function clearCompletedUploads() {
    setUploads((currentUploads) =>
      currentUploads.filter((upload) => upload.status !== "success"),
    );
    if (
      completedNativeShares.length > 0 ||
      dismissibleNativeShares.length > 0
    ) {
      invokeNativeShareAction("clear-completed");
    }
  }

  function retryFailedUploads() {
    if (isUploading || activeNativeShares.length > 0) return;

    if (failedNativeShares.some((item) => item.retryable)) {
      invokeNativeShareAction("retry");
    }

    if (failedUploads.length === 0) return;

    const localPaths = failedUploads
      .map((upload) => upload.localPath)
      .filter((path): path is string => Boolean(path));

    if (localPaths.length === failedUploads.length) {
      uploadDroppedLocalPaths(localPaths);
      return;
    }

    uploadFiles(failedUploads.map((upload) => upload.file));
  }

  return (
    <div data-drop-den-share-target>
      <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Send files</h2>
          <p className="mt-1 text-xs leading-5 text-neutral-600">
            Upload media, documents, archives, or any local files to this den.
          </p>
        </div>

        <div className="rounded-xl bg-neutral-100 p-2 text-neutral-700">
          <Upload size={16} />
        </div>
      </div>

      <div className="mt-3">
        <label className="text-xs font-medium text-neutral-700">
          Send to
        </label>

        <div className={`mt-1.5 ${isUploading ? "pointer-events-none opacity-60" : ""}`}>
          <SelectMenu
            value={targetDeviceId}
            onChange={setTargetDeviceId}
            ariaLabel="Send files to"
            options={[
              { value: "", label: "Everyone in the den" },
              ...targetDevices.map((targetDevice) => ({
                value: targetDevice.id,
                label: targetDevice.name,
              })),
            ]}
          />
        </div>

        <p className="mt-2 text-xs text-neutral-500">
          Targeted files are shown to you and the selected device. Transfers
          expire after {formatDuration(transferTtlSeconds)}.
        </p>
      </div>

      <label
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={[
          "mt-3 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-5 text-center transition",
          isDragging
            ? "border-neutral-900 bg-neutral-100"
            : "border-neutral-300 bg-neutral-50 hover:bg-neutral-100",
          isUploading ? "pointer-events-none opacity-70" : "",
        ].join(" ")}
      >
        <span className="font-medium">
          {isDragging ? "Drop files here" : "Choose or drop files"}
        </span>

        <span className="mt-1 text-xs leading-5 text-neutral-500">
          Multiple files are uploaded one after another. Max file size:{" "}
          {formatBytes(maxUploadSizeBytes)}.
        </span>

        <input
          className="hidden"
          type="file"
          multiple
          onChange={onFileChange}
          disabled={isUploading}
        />
      </label>

      {totalQueueItems > 0 && (
        <section className="mt-3 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50/70">
          <div className="border-b border-neutral-200 bg-white px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-neutral-900">Upload queue</p>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600">
                    {totalQueueItems}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                  {formatBatchStatus(
                    totalQueueItems,
                    totalActiveUploads,
                    totalCompletedUploads,
                    totalFailedUploads,
                  )}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {hasRetryableFailure &&
                  !isUploading &&
                  activeNativeShares.length === 0 && (
                  <button
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
                    type="button"
                    onClick={retryFailedUploads}
                  >
                    <RotateCcw size={12} /> Retry
                  </button>
                )}
                {failedNativeShares.some((item) => item.retryable) &&
                  activeNativeShares.length === 0 && (
                    <button
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                      type="button"
                      onClick={() => invokeNativeShareAction("change-host")}
                    >
                      <Radio size={12} /> Host
                    </button>
                  )}
                {(totalCompletedUploads > 0 ||
                  dismissibleNativeShares.length > 0) && (
                  <button
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                    type="button"
                    onClick={clearCompletedUploads}
                  >
                    <Trash2 size={12} /> Clear
                  </button>
                )}
              </div>
            </div>

            {(isUploading || activeNativeShares.length > 0) && (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className={[
                    "h-full rounded-full bg-neutral-900 transition-all",
                    activeNativeShares.length > 0 ? "animate-pulse" : "",
                  ].join(" ")}
                  style={{
                    width: activeNativeShares.length > 0 ? "55%" : `${batchProgress}%`,
                  }}
                />
              </div>
            )}
          </div>

          <div className="drop-den-scrollbar max-h-60 space-y-1.5 overflow-y-auto p-2">
            {activeUploads.map((upload) => (
              <div
                key={upload.id}
                className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5"
              >
                <div className="flex items-start gap-2.5">
                  <LoaderCircle
                    className="mt-0.5 shrink-0 animate-spin text-neutral-500"
                    size={14}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-neutral-900">
                      {upload.file.name}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                      {formatUploadDetail(upload)}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums text-neutral-600">
                    {upload.progress}%
                  </span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-neutral-900 transition-all"
                    style={{ width: `${upload.progress}%` }}
                  />
                </div>
              </div>
            ))}

            {activeNativeShares.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5"
              >
                <div className="flex items-start gap-2.5">
                  <LoaderCircle
                    className="mt-0.5 shrink-0 animate-spin text-neutral-500"
                    size={14}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-neutral-900">
                      {item.name}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                      {formatNativeShareDetail(item)}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] font-medium text-neutral-500">
                    Android
                  </span>
                </div>
              </div>
            ))}

            {failedUploads.map((upload) => (
              <div
                key={upload.id}
                className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5"
              >
                <CircleAlert className="mt-0.5 shrink-0 text-red-600" size={14} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-red-900">
                    {upload.file.name}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-red-700">
                    {upload.error ?? "Upload failed."}
                  </p>
                </div>
              </div>
            ))}

            {failedNativeShares.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5"
              >
                <CircleAlert className="mt-0.5 shrink-0 text-red-600" size={14} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-red-900">
                    {item.name}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-red-700">
                    {item.error ?? "Upload failed."}
                  </p>
                </div>
              </div>
            ))}

            {completedUploads.length > 0 && (
              <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800">
                <CheckCircle2 className="shrink-0" size={14} />
                <p className="min-w-0 flex-1 text-[11px] font-medium">
                  {completedUploads.length === 1
                    ? `${completedUploads[0].file.name} uploaded`
                    : `${completedUploads.length} files uploaded`}
                </p>
                <span className="shrink-0 text-[10px] text-emerald-700/70">
                  Auto-clears
                </span>
              </div>
            )}

            {completedNativeShares.length > 0 && (
              <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800">
                <CheckCircle2 className="shrink-0" size={14} />
                <p className="min-w-0 flex-1 truncate text-[11px] font-medium">
                  {completedNativeShares.length === 1
                    ? `${completedNativeShares[0].name} uploaded`
                    : `${completedNativeShares.length} Android shares uploaded`}
                </p>
                <span className="shrink-0 text-[10px] text-emerald-700/70">
                  Auto-clears
                </span>
              </div>
            )}
          </div>
        </section>
      )}
      </Card>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );

  const value = bytes / 1024 ** unitIndex;

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDuration(seconds: number) {
  const hours = Math.round(seconds / 60 / 60);

  if (hours < 24) {
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }

  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function formatBatchStatus(
  total: number,
  active: number,
  completed: number,
  failed: number,
) {
  if (active > 1) {
    return `Uploading ${active} files · ${completed} complete`;
  }

  if (active === 1) {
    return `Uploading ${Math.min(completed + failed + 1, total)} of ${total}`;
  }

  if (failed > 0) {
    return `${completed} uploaded · ${failed} failed`;
  }

  return completed === 1 ? "Upload complete" : `${completed} uploads complete`;
}

function formatUploadDetail(upload: UploadItem) {
  if (upload.size === null) {
    return upload.status === "queued"
      ? "Desktop file · Queued"
      : "Desktop file · Uploading";
  }

  if (upload.status === "uploading") {
    const uploadedBytes = Math.round(upload.size * (upload.progress / 100));
    return `${formatBytes(uploadedBytes)} of ${formatBytes(upload.size)}`;
  }

  return `${formatBytes(upload.size)} · Queued`;
}

function formatNativeShareDetail(item: NativeShareItem) {
  const size = item.size === null ? "Shared file" : formatBytes(item.size);
  return `${size} · ${item.status === "queued" ? "Preparing" : "Uploading"}`;
}

function invokeNativeShareAction(action: string) {
  window.location.href = `dropden-native://share/${action}`;
}

function createUploadId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createSyntheticFileFromPath(path: string): File {
  const filename = path.split(/[\\/]/).pop() || "dropped-file";

  return new File([], filename, {
    type: "application/octet-stream",
  });
}
