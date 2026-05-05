import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useWebSocketRefresh() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

    socket.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    };

    return () => socket.close();
  }, [queryClient]);
}
