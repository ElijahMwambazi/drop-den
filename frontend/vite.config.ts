import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.DROP_DEN_API_TARGET ?? "http://localhost:8080";
const wsTarget = apiTarget.replace(/^http/, "ws");

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/ws": {
        target: wsTarget,
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
