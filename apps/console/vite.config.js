import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const FRACTA_ORIGIN = "https://cogentia.fractavolta.com";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_DEV_OPS_PROXY || FRACTA_ORIGIN;

  return {
    plugins: [react(), tailwindcss()],
    base: env.VITE_CONSOLE_BASE || "/ops/console/",
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
    server: {
      port: Number(env.VITE_CONSOLE_PORT || 5174),
      proxy: {
        "/ops": {
          target: proxyTarget,
          changeOrigin: true,
          secure: true,
        },
        "/node": {
          target: "http://127.0.0.1:8794",
          changeOrigin: true,
        },
      },
    },
  };
});