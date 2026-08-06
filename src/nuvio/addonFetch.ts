/**
 * Fetch addon JSON, falling back to the Vite proxy when CORS blocks direct access.
 *
 * BingeCat (and other configurable addons) put config in the query string, e.g.
 * `…/nuvio/manifest.json?bcv=20`. Path and query must stay split the way Nuvio TV does.
 */

export type AddonEndpoint = {
  /** Addon root without trailing slash and without /manifest.json */
  pathBase: string;
  /** Includes leading `?`, or empty */
  query: string;
};

export function parseAddonEndpoint(raw: string): AddonEndpoint {
  const trimmed = raw.trim();
  const q = trimmed.indexOf("?");
  let path = (q >= 0 ? trimmed.slice(0, q) : trimmed).replace(/\/+$/, "");
  const query = q >= 0 ? trimmed.slice(q) : "";
  if (path.toLowerCase().endsWith("/manifest.json")) {
    path = path.slice(0, -"/manifest.json".length).replace(/\/+$/, "");
  }
  return { pathBase: path, query };
}

/** Normalize stored addon URL / base for lookups (path + query, no /manifest.json). */
export function canonicalizeAddonBase(raw: string): string {
  const { pathBase, query } = parseAddonEndpoint(raw);
  return `${pathBase}${query}`;
}

export function manifestUrl(rawOrBase: string): string {
  const { pathBase, query } = parseAddonEndpoint(rawOrBase);
  return `${pathBase}/manifest.json${query}`;
}

export function catalogPageUrl(addonBase: string, type: string, catalogId: string): string {
  const { pathBase, query } = parseAddonEndpoint(addonBase);
  const safeType = encodeURIComponent(type);
  const safeId = catalogId
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${pathBase}/catalog/${safeType}/${safeId}.json${query}`;
}

export function metaUrl(addonBase: string, type: string, id: string): string {
  const { pathBase, query } = parseAddonEndpoint(addonBase);
  const safeId = id.split("/").map(encodeURIComponent).join("/");
  return `${pathBase}/meta/${encodeURIComponent(type)}/${safeId}.json${query}`;
}

/**
 * Rebuild BingeCat’s Nuvio addon base from home-catalog addon_id
 * `com.aicat.<uuid>.nuvio` when the addons table row is missing/mismatched.
 */
export function bingeCatNuvioBaseFromAddonId(addonId: string): string | undefined {
  const m = /^com\.aicat\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.nuvio$/i.exec(
    addonId.trim(),
  );
  if (!m) return undefined;
  return `https://bingecat.com/stremio/${m[1]}/nuvio?bcv=20`;
}

export async function fetchAddonJson<T>(url: string): Promise<T> {
  const direct = await tryFetchJson<T>(url);
  if (direct.ok) return direct.data;

  const proxied = `/__addon-proxy?url=${encodeURIComponent(url)}`;
  const viaProxy = await tryFetchJson<T>(proxied);
  if (viaProxy.ok) return viaProxy.data;

  throw new Error(viaProxy.error || direct.error || `Failed to fetch ${url}`);
}

async function tryFetchJson<T>(
  url: string,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} for ${url}` };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
