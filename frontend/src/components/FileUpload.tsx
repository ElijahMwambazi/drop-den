import { ChangeEvent, DragEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { listDevices } from "../api/devices";
import { uploadTransfer } from "../api/transfers";
import { useDeviceStore } from "../store/deviceStore";
import { Card } from "./Card";

type UploadStatus = "queued" | "uploading" | "success" | "error";

type UploadItem = {
  id: string;
  file: File;
  progress: number;
  status: UploadStatus;
  error?: string;
};

async function uploadFiles(files: File[]) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [targetDeviceId, setTargetDeviceId] = useState("");
  const [uploadDebugMessage, setUploadDebugMessage] = useState("");

  setUploadDebugMessage(`Selected ${files.length} file(s).`);

  if (files.length === 0) {
    setUploadDebugMessage("No files were selected by the browser.");
    return;
  }

  const uploadItems: UploadItem[] = files.map((file) => ({
    id: createUploadId(),
    file,
    progress: 0,
    status: "queued",
  }));

  setUploads(uploadItems);

  const queryClient = useQueryClient();
  const device = useDeviceStore((state) => state.device);

  const { data: devices = [] } = useQuery({
    queryKey: ["devices"],
    queryFn: listDevices,
  });

  const targetDevices = devices.filter(
    (targetDevice) => targetDevice.id !== device?.id,
  );

  const isUploading = uploads.some(
    (upload) => upload.status === "queued" || upload.status === "uploading",
  );

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;

    const uploadItems: UploadItem[] = files.map((file) => ({
      id: createUploadId(),
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
      } catch (error) {
        setUploads((currentUploads) =>
          currentUploads.map((item) =>
            item.id === uploadItem.id
              ? {
                  ...item,
                  status: "error",
                  error:
                    error instanceof Error ? error.message : "Upload failed.",
                }
              : item,
          ),
        );
      }
    }

    queryClient.invalidateQueries({ queryKey: ["transfers"] });
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    uploadFiles(files);

    event.target.value = "";
  }

  function onDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave() {
    setIsDragging(false);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);

    const files = Array.from(event.dataTransfer.files ?? []);

    uploadFiles(files);
  }

  function clearCompletedUploads() {
    setUploads((currentUploads) =>
      currentUploads.filter((upload) => upload.status !== "success"),
    );
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Send files</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Upload media, documents, archives, or any local files to this den.
          </p>
        </div>

        <div className="rounded-2xl bg-neutral-100 p-3 text-neutral-700">
          <Upload size={20} />
        </div>
      </div>

      <div className="mt-4">
        <label
          className="text-sm font-medium text-neutral-700"
          htmlFor="target-device"
        >
          Send to
        </label>

        <select
          id="target-device"
          className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm outline-none focus:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
          value={targetDeviceId}
          onChange={(event) => setTargetDeviceId(event.target.value)}
          disabled={isUploading}
        >
          <option value="">Everyone in the den</option>

          {targetDevices.map((targetDevice) => (
            <option key={targetDevice.id} value={targetDevice.id}>
              {targetDevice.name}
            </option>
          ))}
        </select>

        <p className="mt-2 text-xs text-neutral-500">
          Targeted files are shown to you and the selected device.
        </p>
      </div>

      <label
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={[
          "mt-4 flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed p-8 text-center transition",
          isDragging
            ? "border-neutral-900 bg-neutral-100"
            : "border-neutral-300 bg-neutral-50 hover:bg-neutral-100",
          isUploading ? "pointer-events-none opacity-70" : "",
        ].join(" ")}
      >
        <span className="font-medium">
          {isDragging ? "Drop files here" : "Choose or drop files"}
        </span>

        <span className="mt-1 text-sm text-neutral-500">
          Multiple files are uploaded one after another.
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

      {uploadDebugMessage && (
        <p className="mt-3 text-xs text-neutral-500">{uploadDebugMessage}</p>
      )}

      {uploads.length > 0 && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-neutral-700">Upload queue</p>

            {uploads.some((upload) => upload.status === "success") && (
              <button
                className="text-sm font-medium text-neutral-500 hover:text-neutral-900"
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
              className="rounded-2xl border border-neutral-200 bg-white p-4"
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

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
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

function createUploadId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
