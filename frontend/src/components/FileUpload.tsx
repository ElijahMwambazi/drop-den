import { ChangeEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadTransfer } from "../api/transfers";
import { useDeviceStore } from "../store/deviceStore";
import { Card } from "./Card";

export function FileUpload() {
  const queryClient = useQueryClient();
  const device = useDeviceStore((state) => state.device);

  const mutation = useMutation({
    mutationFn: (file: File) => uploadTransfer(file, device?.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["transfers"] }),
  });

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) mutation.mutate(file);
    event.target.value = "";
  }

  return (
    <Card>
      <h2 className="text-xl font-semibold">Send a file</h2>
      <p className="mt-2 text-sm text-neutral-600">Upload media, documents, archives, or any local file to this den.</p>
      <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center hover:bg-neutral-100">
        <span className="font-medium">Choose file</span>
        <span className="mt-1 text-sm text-neutral-500">MVP supports one file at a time.</span>
        <input className="hidden" type="file" onChange={onFileChange} />
      </label>
      {mutation.isPending && <p className="mt-3 text-sm text-neutral-600">Uploading...</p>}
      {mutation.isError && <p className="mt-3 text-sm text-red-600">Upload failed.</p>}
    </Card>
  );
}
