import type { Plugin } from "vite";
import http from "node:http";
import https from "node:https";

/**
 * Dev/preview proxy so Studio can load Stremio addon JSON without browser CORS blocks.
 * GET /__addon-proxy?url=https%3A%2F%2F…
 */
export function addonProxyPlugin(): Plugin {
  const handle = (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    next: () => void,
  ) => {
    const rawUrl = req.url ?? "";
    if (!rawUrl.startsWith("/__addon-proxy")) {
      next();
      return;
    }

    let target: string | null = null;
    try {
      const parsed = new URL(rawUrl, "http://localhost");
      target = parsed.searchParams.get("url");
    } catch {
      target = null;
    }

    if (!target || !/^https?:\/\//i.test(target)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Missing or invalid url query param" }));
      return;
    }

    const lib = target.startsWith("https:") ? https : http;
    const upstream = lib.get(
      target,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "NuvioReframeStudio/0.1",
        },
        timeout: 20_000,
      },
      (up) => {
        const status = up.statusCode ?? 502;
        res.statusCode = status;
        res.setHeader("Access-Control-Allow-Origin", "*");
        const contentType = up.headers["content-type"] || "application/json";
        res.setHeader("Content-Type", contentType);
        up.pipe(res);
      },
    );

    upstream.on("error", (err) => {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: String(err.message || err) }));
    });

    upstream.on("timeout", () => {
      upstream.destroy();
      res.statusCode = 504;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Upstream timeout" }));
    });
  };

  return {
    name: "nuvio-addon-proxy",
    configureServer(server) {
      server.middlewares.use(handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle);
    },
  };
}
