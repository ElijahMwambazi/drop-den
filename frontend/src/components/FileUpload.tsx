import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
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
  progress: number;
  status: UploadStatus;
  error?: string;
};

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
  const [isDragging, setIsDragging] = useState(false);
  const [targetDeviceId, setTargetDeviceId] = useState("");
  const [uploadDebugMessage, setUploadDebugMessage] = useState("");

  const lastDesktopDropSignatureRef = useRef("");
  const lastDesktopDropTimeRef = useRef(0);
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

  useEffect(() => {
    deviceIdRef.current = device?.id;
    targetDeviceIdRef.current = targetDeviceId;
  }, [device?.id, targetDeviceId]);

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
                setUploadDebugMessage("Dropped 0 local path(s).");
                return;
              }

              if (shouldIgnoreDuplicateDesktopDrop(paths)) {
                setUploadDebugMessage("Ignored duplicate desktop drop event.");
                return;
              }

              setUploadDebugMessage(`Dropped ${paths.length} local path(s).`);

              uploadDroppedLocalPaths(paths);
            }
          },
        );

        if (isMounted) {
          setUploadDebugMessage("Desktop drag/drop listener ready.");
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : JSON.stringify(error);

        setUploadDebugMessage(`Desktop drag/drop listener failed: ${message}`);
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
    setUploadDebugMessage(`Uploading ${paths.length} dropped local file(s).`);

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
        currentUploads.map((upload) => ({
          ...upload,
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

      setUploadDebugMessage(errorMessage);

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
    setUploadDebugMessage(`Selected ${files.length} file(s).`);

    if (files.length === 0) {
      setUploadDebugMessage("No files were selected by the browser.");
      return;
    }

    const allowedFiles = files.filter(
      (file) => file.size <= maxUploadSizeBytes,
    );
    const blockedFiles = files.filter((file) => file.size > maxUploadSizeBytes);

    for (const file of blockedFiles) {
      addToast({
        type: "error",
        message: `${file.name} is larger than ${formatBytes(maxUploadSizeBytes)}.`,
      });
    }

    if (allowedFiles.length === 0) {
      setUploadDebugMessage(
        `No files uploaded. Max file size is ${formatBytes(maxUploadSizeBytes)}.`,
      );
      return;
    }

    const uploadItems: UploadItem[] = allowedFiles.map((file) => ({
      id: createUploadId(),
      file,
      progress: 0,
      status: "queued",
    }));

    setUploads(uploadItems);

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

        addToast({
          type: "success",
          message: `${uploadItem.file.name} uploaded.`,
        });
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

        addToast({
          type: "error",
          message: errorMessage,
        });
      }
    }

    queryClient.invalidateQueries({ queryKey: ["transfers"] });
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

    setUploadDebugMessage(`Dropped ${files.length} file(s).`);

    uploadFiles(files);
  }

  function clearCompletedUploads() {
    setUploads((currentUploads) =>
      currentUploads.filter((upload) => upload.status !== "success"),
    );
  }

  return (
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

      {uploadDebugMessage && (
        <p className="mt-3 text-xs text-neutral-500">{uploadDebugMessage}</p>
      )}

      {uploads.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-neutral-700">Upload queue</p>

            {uploads.some((upload) => upload.status === "success") && (
              <button
                className="text-sm font-medium text-neutral-500 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={clearCompletedUploads}
                disabled={isUploading}
              >
                Clear completed
              </button>
            )}
          </div>

          {uploads.map((upload) => (
            <div
              key={upload.id}
              className="rounded-xl border border-neutral-200 bg-white p-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">
                    {upload.file.name}
                  </p>

                  <p className="mt-1 text-xs text-neutral-500">
                    {formatBytes(upload.file.size)} ·{" "}
                    {formatUploadStatus(upload.status)}
                  </p>
                </div>

                <p className="text-sm font-medium text-neutral-700">
                  {upload.progress}%
                </p>
              </div>

              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className={[
                    "h-full rounded-full transition-all",
                    upload.status === "error"
                      ? "bg-red-600"
                      : upload.status === "success"
                        ? "bg-green-700"
                        : "bg-neutral-900",
                  ].join(" ")}
                  style={{ width: `${upload.progress}%` }}
                />
              </div>

              {upload.error && (
                <p className="mt-2 text-sm text-red-600">{upload.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
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

function formatUploadStatus(status: UploadStatus) {
  switch (status) {
    case "queued":
      return "Queued";
    case "uploading":
      return "Uploading";
    case "success":
      return "Uploaded";
    case "error":
      return "Failed";
  }
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
