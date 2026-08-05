import type { NuvioConfig, NuvioSession } from "./types";

function headers(config: NuvioConfig, accessToken?: string): HeadersInit {
  const h: Record<string, string> = {
    apikey: config.anonKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (accessToken) h.Authorization = `Bearer ${accessToken}`;
  return h;
}

export async function signInWithPassword(
  config: NuvioConfig,
  email: string,
  password: string,
): Promise<NuvioSession> {
  assertConfig(config);
  const url = `${config.supabaseUrl}/auth/v1/token?grant_type=password`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error_description || body?.msg || body?.error || `Sign-in failed (${res.status})`);
  }
  const accessToken = String(body.access_token ?? "");
  const refreshToken = String(body.refresh_token ?? "");
  const expiresIn = Number(body.expires_in ?? 3600);
  const user = body.user ?? {};
  const userId = String(user.id ?? "");
  const userEmail = String(user.email ?? email.trim());
  if (!accessToken || !userId) throw new Error("Sign-in response missing tokens");
  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    userId,
    email: userEmail,
  };
}

export async function rpc<T>(
  config: NuvioConfig,
  session: NuvioSession,
  name: string,
  payload: Record<string, unknown>,
): Promise<T> {
  assertConfig(config);
  const url = `${config.supabaseUrl}/rest/v1/rpc/${name}`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(config, session.accessToken),
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg =
      (body && (body.message || body.error || body.hint)) ||
      `RPC ${name} failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body as T;
}

export async function restGet<T>(
  config: NuvioConfig,
  session: NuvioSession,
  pathAndQuery: string,
): Promise<T> {
  assertConfig(config);
  const url = `${config.supabaseUrl}/rest/v1/${pathAndQuery.replace(/^\//, "")}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      ...headers(config, session.accessToken),
      Prefer: "return=representation",
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.message || `REST GET failed (${res.status})`);
  }
  return body as T;
}

function assertConfig(config: NuvioConfig) {
  if (!config.supabaseUrl || !config.anonKey) {
    throw new Error("Set Supabase URL and anon key first");
  }
}
