export type Device = {
  id: string;
  name: string;
  connected_at: string;
};

export type AppConfig = {
  app_name: string;
  port: number;
  local_only: boolean;
  join_pin: string;
};

export type TransferStatus = "available" | "pending" | "accepted" | "rejected";

export type Transfer = {
  id: string;
  filename: string;
  mime_type: string;
  size: number;
  sender_device_id?: string | null;
  target_device_id?: string | null;
  status: TransferStatus;
  stored_path: string;
  created_at: string;
};

export type LocalMessage = {
  id: string;
  sender_device_id?: string | null;
  body: string;
  created_at: string;
};

export type WsEvent<T = unknown> = {
  event_type: string;
  payload: T;
};
