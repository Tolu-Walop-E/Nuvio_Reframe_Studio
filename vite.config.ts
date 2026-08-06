import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { addonProxyPlugin } from "./src/nuvio/addonProxyPlugin.ts";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), addonProxyPlugin()],
});
