import { ChangeEvent, DragEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { uploadTransfer } from "../api/transfers";
import { useDeviceStore } from "../store/deviceStore";
import { Card } from "./Card";

export function FileUpload() {
  const queryClient = useQueryClient();
  const device = useDeviceStore((state) => state.device);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const mutation = useMutation({
    mutationFn: (file: File) =>
      uploadTransfer(file, {
        senderDeviceId: device?.id,
        onProgress: setUploadProgress,
      }),
    onSuccess: () => {
      setUploadProgress(100);
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
    },
  });

  function uploadFile(file: File) {
    setSelectedFile(file);
    setUploadProgress(0);
    mutation.reset();
    mutation.mutate(file);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) {
      uploadFile(file);
    }

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

    const file = event.dataTransfer.files?.[0];

    if (file) {
      uploadFile(file);
    }
  }

  const isUploading = mutation.isPending;

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Send a file</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Upload media, documents, archives, or any local file to this den.
          </p>
        </div>

        <div className="rounded-2xl bg-neutral-100 p-3 text-neutral-700">
          <Upload size={20} />
        </div>
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
          {isDragging ? "Drop file here" : "Choose or drop file"}
        </span>

        <span className="mt-1 text-sm text-neutral-500">
          MVP supports one file at a time.
        </span>

        <input
          className="hidden"
          type="file"
          onChange={onFileChange}
          disabled={isUploading}
        />
      </label>

      {selectedFile && (
        <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-neutral-900">
                {selectedFile.name}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {formatBytes(selectedFile.size)}
              </p>
            </div>

            <p className="text-sm font-medium text-neutral-700">
              {uploadProgress}%
            </p>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-neutral-900 transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {mutation.isSuccess && (
        <p className="mt-3 text-sm text-green-700">Upload complete.</p>
      )}

      {mutation.isError && (
        <p className="mt-3 text-sm text-red-600">
          {mutation.error instanceof Error
            ? mutation.error.message
            : "Upload failed."}
        </p>
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
