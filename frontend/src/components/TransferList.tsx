import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteTransfer, listTransfers, transferDownloadUrl } from "../api/transfers";
import { Card } from "./Card";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function TransferList() {
  const queryClient = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["transfers"], queryFn: listTransfers });

  const remove = useMutation({
    mutationFn: deleteTransfer,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["transfers"] }),
  });

  return (
    <Card>
      <h2 className="text-xl font-semibold">Transfers</h2>
      <div className="mt-4 space-y-3">
        {data.length === 0 ? (
          <p className="text-sm text-neutral-500">No files have been shared yet.</p>
        ) : (
          data.map((transfer) => (
            <div key={transfer.id} className="flex flex-col gap-3 rounded-2xl bg-neutral-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{transfer.filename}</p>
                <p className="text-sm text-neutral-500">
                  {formatBytes(transfer.size)} · {transfer.mime_type} · {new Date(transfer.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2">
                <a className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white" href={transferDownloadUrl(transfer.id)}>
                  Download
                </a>
                <button className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium" onClick={() => remove.mutate(transfer.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
