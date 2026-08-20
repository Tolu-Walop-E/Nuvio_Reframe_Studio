import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { addonProxyPlugin } from "./src/nuvio/addonProxyPlugin.ts";
import { viewPackPublishPlugin } from "./src/nuvio/viewPackPublishPlugin.ts";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), addonProxyPlugin(), viewPackPublishPlugin()],
});
