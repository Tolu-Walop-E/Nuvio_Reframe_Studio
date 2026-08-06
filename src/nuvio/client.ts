import { saveSession } from "./config";
import type { NuvioConfig, NuvioSession } from "./types";

/** Refresh this many ms before hard expiry. */
const EXPIRY_SKEW_MS = 60_000;

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
  return sessionFromTokenResponse(body, email.trim());
}

/**
 * Exchange refresh_token for a new access token.
 * Persists to localStorage so remounts stay signed in.
 */
export async function refreshSession(
  config: NuvioConfig,
  session: NuvioSession,
): Promise<NuvioSession> {
  assertConfig(config);
  if (!session.refreshToken?.trim()) {
    throw new Error("Session expired — sign in again");
  }
  const url = `${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    saveSession(null);
    throw new Error(
      body?.error_description ||
        body?.msg ||
        body?.error ||
        "Session expired — sign in again",
    );
  }
  const next = sessionFromTokenResponse(body, session.email);
  // Keep prior email/userId if token response omits them
  const merged: NuvioSession = {
    ...next,
    email: next.email || session.email,
    userId: next.userId || session.userId,
    refreshToken: next.refreshToken || session.refreshToken,
  };
  saveSession(merged);
  return merged;
}

/** Refresh when expired or within skew; otherwise return the same session. */
export async function ensureFreshSession(
  config: NuvioConfig,
  session: NuvioSession,
): Promise<NuvioSession> {
  const expiresAt = Number(session.expiresAt) || 0;
  if (expiresAt > Date.now() + EXPIRY_SKEW_MS) {
    return session;
  }
  return refreshSession(config, session);
}

export async function rpc<T>(
  config: NuvioConfig,
  session: NuvioSession,
  name: string,
  payload: Record<string, unknown>,
): Promise<T> {
  return withAuthRetry(config, session, async (s) => {
    const url = `${config.supabaseUrl}/rest/v1/rpc/${name}`;
    const res = await fetch(url, {
      method: "POST",
      headers: headers(config, s.accessToken),
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const msg =
        (body && (body.message || body.error || body.hint)) ||
        `RPC ${name} failed (${res.status})`;
      const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    return body as T;
  });
}

export async function restGet<T>(
  config: NuvioConfig,
  session: NuvioSession,
  pathAndQuery: string,
): Promise<T> {
  return withAuthRetry(config, session, async (s) => {
    const url = `${config.supabaseUrl}/rest/v1/${pathAndQuery.replace(/^\//, "")}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        ...headers(config, s.accessToken),
        Prefer: "return=representation",
      },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(body?.message || `REST GET failed (${res.status})`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    return body as T;
  });
}

async function withAuthRetry<T>(
  config: NuvioConfig,
  session: NuvioSession,
  run: (session: NuvioSession) => Promise<T>,
): Promise<T> {
  assertConfig(config);
  let current = await ensureFreshSession(config, session);
  try {
    return await run(current);
  } catch (e) {
    if (!isAuthFailure(e)) throw e;
    // Force refresh even if our clock thought the token was still valid
    current = await refreshSession(config, current);
    return await run(current);
  }
}

function isAuthFailure(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const status = (e as Error & { status?: number }).status;
  if (status === 401) return true;
  const msg = e.message.toLowerCase();
  return (
    msg.includes("jwt expired") ||
    msg.includes("invalid jwt") ||
    msg.includes("not authenticated") ||
    msg.includes("pgrst301")
  );
}

function sessionFromTokenResponse(body: Record<string, unknown>, fallbackEmail: string): NuvioSession {
  const accessToken = String(body.access_token ?? "");
  const refreshToken = String(body.refresh_token ?? "");
  const expiresIn = Number(body.expires_in ?? 3600);
  const user = (body.user ?? {}) as Record<string, unknown>;
  const userId = String(user.id ?? "");
  const userEmail = String(user.email ?? fallbackEmail);
  if (!accessToken) throw new Error("Auth response missing access_token");
  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    userId,
    email: userEmail,
  };
}

function assertConfig(config: NuvioConfig) {
  if (!config.supabaseUrl || !config.anonKey) {
    throw new Error("Set Supabase URL and anon key first");
  }
}
