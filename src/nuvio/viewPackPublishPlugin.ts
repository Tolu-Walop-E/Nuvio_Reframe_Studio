import type { Plugin } from "vite";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import { URL } from "node:url";
import { randomUUID } from "node:crypto";

type StoredPack = {
  id: string;
  body: Buffer;
  createdAt: number;
};

const localPacks = new Map<string, StoredPack>();
const LOCAL_TTL_MS = 1000 * 60 * 60 * 24; // 24h

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(JSON.stringify(body));
}

function purgeExpired() {
  const now = Date.now();
  for (const [id, pack] of localPacks) {
    if (now - pack.createdAt > LOCAL_TTL_MS) localPacks.delete(id);
  }
}

function lanIps(): string[] {
  const out: string[] = [];
  const ifaces = os.networkInterfaces();
  for (const entries of Object.values(ifaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      out.push(entry.address);
    }
  }
  return out;
}

function requestOrigin(req: http.IncomingMessage): string {
  const host = req.headers.host || "localhost:5173";
  const protoHeader = req.headers["x-forwarded-proto"];
  const proto = typeof protoHeader === "string" ? protoHeader.split(",")[0] : "http";
  return `${proto}://${host}`;
}

function httpsRequest(
  opts: https.RequestOptions,
  body?: Buffer,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (up) => {
      const chunks: Buffer[] = [];
      up.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      up.on("end", () =>
        resolve({
          status: up.statusCode ?? 502,
          headers: up.headers,
          body: Buffer.concat(chunks),
        }),
      );
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("Upstream timeout"));
    });
    if (body) req.write(body);
    req.end();
  });
}

async function publishLitterbox(jsonBody: Buffer): Promise<{ id: string; url: string } | null> {
  const boundary = `----nuvio${Date.now()}`;
  const parts = [
    `--${boundary}\r\nContent-Disposition: form-data; name="reqtype"\r\n\r\nfileupload\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="time"\r\n\r\n72h\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="fileToUpload"; filename="view.json"\r\nContent-Type: application/json\r\n\r\n`,
  ];
  const payload = Buffer.concat([
    Buffer.from(parts[0]),
    Buffer.from(parts[1]),
    Buffer.from(parts[2]),
    jsonBody,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  try {
    const up = await httpsRequest(
      {
        hostname: "litterbox.catbox.moe",
        path: "/resources/internals/api.php",
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": payload.length,
          "User-Agent": "NuvioReframeStudio/0.1",
        },
        timeout: 25_000,
      },
      payload,
    );
    if (up.status < 200 || up.status >= 300) return null;
    const url = up.body.toString("utf8").trim();
    if (!/^https?:\/\//i.test(url)) return null;
    const id = url.split("/").pop()?.replace(/\.json$/i, "") || randomUUID();
    return { id, url };
  } catch {
    return null;
  }
}

async function publishJsonblob(
  jsonBody: Buffer,
  updateId?: string | null,
): Promise<{ id: string; url: string } | null> {
  const path = updateId
    ? `/api/jsonBlob/${encodeURIComponent(updateId)}`
    : "/api/jsonBlob";
  try {
    const up = await httpsRequest(
      {
        hostname: "jsonblob.com",
        path,
        method: updateId ? "PUT" : "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Content-Length": jsonBody.length,
          "User-Agent": "NuvioReframeStudio/0.1",
        },
        timeout: 20_000,
      },
      jsonBody,
    );
    if (up.status === 429) {
      throw Object.assign(new Error("Rate limited by jsonblob (HTTP 429). Try again in a minute, or use New link."), {
        code: 429,
      });
    }
    if (up.status < 200 || up.status >= 300) return null;
    const location = String(up.headers.location || "");
    const headerId = String(up.headers["x-jsonblob-id"] || "");
    const m = /\/api\/jsonBlob\/([^/?#]+)/i.exec(location);
    const id = headerId || m?.[1] || updateId;
    if (!id) return null;
    return {
      id,
      url: `https://jsonblob.com/api/jsonBlob/${encodeURIComponent(id)}`,
    };
  } catch (e) {
    if ((e as { code?: number })?.code === 429) throw e;
    return null;
  }
}

function publishLocal(
  req: http.IncomingMessage,
  jsonBody: Buffer,
): { id: string; url: string; lanUrls: string[] } {
  purgeExpired();
  const id = randomUUID().replace(/-/g, "").slice(0, 16);
  localPacks.set(id, { id, body: jsonBody, createdAt: Date.now() });
  const origin = requestOrigin(req);
  const path = `/__viewpacks/${id}.json`;
  const lanUrls = lanIps().map((ip) => {
    const port = (req.headers.host || "").split(":")[1] || "5173";
    return `http://${ip}:${port}${path}`;
  });
  return {
    id,
    url: `${origin}${path}`,
    lanUrls,
  };
}

/**
 * Publish view packs with cloud + LAN fallbacks (no browser CORS).
 * POST /__viewpack-publish
 * PUT  /__viewpack-publish?id=… (jsonblob update only)
 * GET  /__viewpacks/:id.json  (LAN / local store)
 */
export function viewPackPublishPlugin(): Plugin {
  const handle = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    next: () => void,
  ) => {
    const rawUrl = req.url ?? "";

    if (rawUrl.startsWith("/__viewpacks/")) {
      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.end();
        return;
      }
      const id = rawUrl.slice("/__viewpacks/".length).replace(/\.json$/i, "").split("?")[0];
      purgeExpired();
      const pack = localPacks.get(id);
      if (!pack) {
        sendJson(res, 404, { error: "View pack expired or not found on this Studio host" });
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-store");
      res.end(pack.body);
      return;
    }

    if (!rawUrl.startsWith("/__viewpack-publish")) {
      next();
      return;
    }

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, PUT, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
      res.end();
      return;
    }

    if (req.method !== "POST" && req.method !== "PUT") {
      sendJson(res, 405, { error: "Use POST to create or PUT to update" });
      return;
    }

    let updateId: string | null = null;
    try {
      const parsed = new URL(rawUrl, "http://localhost");
      updateId = parsed.searchParams.get("id");
    } catch {
      updateId = null;
    }

    let body: Buffer;
    try {
      body = await readBody(req);
    } catch (e) {
      sendJson(res, 400, { error: String(e instanceof Error ? e.message : e) });
      return;
    }
    if (!body.length) {
      sendJson(res, 400, { error: "Empty body" });
      return;
    }

    // Prefer Litterbox (direct JSON URL). Skip PUT attempts on Litterbox.
    if (req.method === "POST") {
      const litter = await publishLitterbox(body);
      if (litter) {
        sendJson(res, 200, { ...litter, provider: "litterbox" });
        return;
      }
    }

    try {
      const blob = await publishJsonblob(body, req.method === "PUT" ? updateId : null);
      if (blob) {
        sendJson(res, 200, { ...blob, provider: "jsonblob" });
        return;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/429|rate limit/i.test(msg)) {
        // Fall through to local LAN store instead of failing hard.
      } else {
        // continue to local
      }
    }

    const local = publishLocal(req, body);
    sendJson(res, 200, {
      id: local.id,
      url: local.lanUrls[0] || local.url,
      provider: "local",
      lanUrls: local.lanUrls,
      note:
        "Cloud publish was rate-limited or unavailable. Using a LAN link — Shield must be on the same Wi‑Fi as this PC, and Studio must stay open.",
    });
  };

  return {
    name: "nuvio-viewpack-publish",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handle(req, res, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handle(req, res, next);
      });
    },
  };
}
