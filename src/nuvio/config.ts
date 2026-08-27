import type { NuvioConfig, NuvioSession } from "./types";

const CONFIG_KEY = "nuvio_reframe_studio.config";
const SESSION_KEY = "nuvio_reframe_studio.session";

export function defaultConfig(): NuvioConfig {
  const fromEnv: NuvioConfig = {
    supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "",
    anonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? "",
  };
  const saved = loadConfig();
  return {
    supabaseUrl: saved.supabaseUrl || fromEnv.supabaseUrl,
    anonKey: saved.anonKey || fromEnv.anonKey,
  };
}

export function loadConfig(): NuvioConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { supabaseUrl: "", anonKey: "" };
    const parsed = JSON.parse(raw) as Partial<NuvioConfig>;
    return {
      supabaseUrl: String(parsed.supabaseUrl ?? "").trim(),
      anonKey: String(parsed.anonKey ?? "").trim(),
    };
  } catch {
    return { supabaseUrl: "", anonKey: "" };
  }
}

export function saveConfig(config: NuvioConfig) {
  localStorage.setItem(
    CONFIG_KEY,
    JSON.stringify({
      supabaseUrl: config.supabaseUrl.trim().replace(/\/$/, ""),
      anonKey: config.anonKey.trim(),
    }),
  );
}

export function loadSession(): NuvioSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NuvioSession;
    if (!parsed.accessToken || !parsed.userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: NuvioSession | null) {
  if (!session) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

const PROFILE_KEY = "nuvio_reframe_studio.profileId";

export function loadStudioProfileId(): number {
  const raw = Number(localStorage.getItem(PROFILE_KEY));
  if (Number.isInteger(raw) && raw >= 1 && raw <= 6) return raw;
  return 1;
}

export function saveStudioProfileId(profileId: number) {
  const id = Number.isInteger(profileId) ? Math.min(6, Math.max(1, profileId)) : 1;
  localStorage.setItem(PROFILE_KEY, String(id));
}
