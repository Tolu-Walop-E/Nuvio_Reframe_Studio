import type { ViewPack } from "../types/viewPack";
import { slugify, withComputedCanvas } from "../types/viewPack";

const LAST_SHARE_KEY = "nuvio_reframe_studio.lastShare";

export type PublishedViewLink = {
  id: string;
  url: string;
  /** `nuvio://viewpack?url=…` — open on the TV (addon-style install). */
  installUrl: string;
  /** Studio landing page that wraps the deep link. */
  installPageUrl: string;
  packId: string;
  packName: string;
  publishedAt: number;
  provider?: string;
  note?: string;
  lanUrls?: string[];
};

/** Deep link Nuvio opens to fetch + apply a hosted pack JSON. */
export function viewPackInstallUrl(packHttpsUrl: string): string {
  return `nuvio://viewpack?url=${encodeURIComponent(packHttpsUrl)}`;
}

/** Local Studio page with an Install button (same Wi‑Fi / while Studio is open). */
export function viewPackInstallPageUrl(packHttpsUrl: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/install?url=${encodeURIComponent(packHttpsUrl)}`;
}

function withInstallLinks(
  link: Omit<PublishedViewLink, "installUrl" | "installPageUrl">,
): PublishedViewLink {
  return {
    ...link,
    installUrl: viewPackInstallUrl(link.url),
    installPageUrl: viewPackInstallPageUrl(link.url),
  };
}

export function loadLastShare(): PublishedViewLink | null {
  try {
    const raw = localStorage.getItem(LAST_SHARE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PublishedViewLink>;
    if (!parsed.id || !parsed.url) return null;
    return withInstallLinks({
      id: String(parsed.id),
      url: String(parsed.url),
      packId: String(parsed.packId ?? ""),
      packName: String(parsed.packName ?? ""),
      publishedAt: Number(parsed.publishedAt) || Date.now(),
      provider: parsed.provider ? String(parsed.provider) : undefined,
      note: parsed.note ? String(parsed.note) : undefined,
      lanUrls: Array.isArray(parsed.lanUrls) ? parsed.lanUrls.map(String) : undefined,
    });
  } catch {
    return null;
  }
}

export function saveLastShare(link: PublishedViewLink) {
  localStorage.setItem(LAST_SHARE_KEY, JSON.stringify(link));
}

function packPayload(pack: ViewPack): ViewPack {
  return withComputedCanvas({
    ...pack,
    id: slugify(pack.name),
    schemaVersion: 1,
  });
}

type PublishResponse = {
  id?: string;
  url?: string;
  error?: string;
  provider?: string;
  note?: string;
  lanUrls?: string[];
};

function friendlyError(status: number, detail?: string): string {
  if (status === 429) {
    return "Publish was rate-limited (too many requests). Wait ~1 minute, then press New link.";
  }
  if (detail?.trim()) return detail.trim();
  return `Publish failed (HTTP ${status})`;
}

/**
 * Publish (or update) a view pack to a unique HTTPS URL the TV can fetch.
 * Goes through the Studio vite proxy so cloud hosts + LAN fallback work without CORS.
 */
export async function publishViewPack(
  pack: ViewPack,
  opts?: { forceNew?: boolean },
): Promise<PublishedViewLink> {
  const payload = packPayload(pack);
  const body = JSON.stringify(payload);
  const last = loadLastShare();
  const reuseId =
    !opts?.forceNew &&
    last?.provider === "jsonblob" &&
    last?.packId === payload.id &&
    last.id
      ? last.id
      : null;

  const endpoint = reuseId
    ? `/__viewpack-publish?id=${encodeURIComponent(reuseId)}`
    : "/__viewpack-publish";
  const method = reuseId ? "PUT" : "POST";

  const res = await fetch(endpoint, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body,
  });

  const contentType = res.headers.get("content-type") || "";
  let data: PublishResponse = {};
  if (contentType.includes("application/json")) {
    data = (await res.json()) as PublishResponse;
  }

  if (!res.ok || data.error || !data.id || !data.url) {
    // One more POST without reuse if PUT failed (e.g. rate limit / expired id).
    if (method === "PUT") {
      const retry = await fetch("/__viewpack-publish", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body,
      });
      const retryData = (await retry.json()) as PublishResponse;
      if (retry.ok && retryData.id && retryData.url) {
        const link = withInstallLinks({
          id: retryData.id,
          url: retryData.url,
          packId: payload.id,
          packName: payload.name,
          publishedAt: Date.now(),
          provider: retryData.provider,
          note: retryData.note,
          lanUrls: retryData.lanUrls,
        });
        saveLastShare(link);
        return link;
      }
      throw new Error(friendlyError(retry.status, retryData.error));
    }
    throw new Error(friendlyError(res.status, data.error));
  }

  const link = withInstallLinks({
    id: data.id,
    url: data.url,
    packId: payload.id,
    packName: payload.name,
    publishedAt: Date.now(),
    provider: data.provider,
    note: data.note,
    lanUrls: data.lanUrls,
  });
  saveLastShare(link);
  return link;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
