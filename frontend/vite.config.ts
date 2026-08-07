import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../", "");

  const viteUrl = new URL(env.VITE_URL || "http://localhost:5173");
  // console.log(viteUrl)
  return {
    envDir: "../",
    server: {
      host: viteUrl.hostname, // "192.168.29.118"
      port: Number(viteUrl.port) || 5173, // 5173
      strictPort: false, 
      allowedHosts: env.VITE_ALLOWED_HOSTS
        ? env.VITE_ALLOWED_HOSTS.split(",")
        : [viteUrl.hostname],
    },
    plugins: [
      react(),
      svgr({
        svgrOptions: {
          icon: true,
          exportType: "named",
          namedExport: "ReactComponent",
        },
      }),
    ],
  };
});
