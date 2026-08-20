import { useState } from "react";
import { ensureFreshSession, signInWithPassword } from "../nuvio/client";
import { defaultConfig, saveConfig, saveSession } from "../nuvio/config";
import { loadNuvioLibrary } from "../nuvio/library";
import type { NuvioConfig, NuvioLibrarySnapshot, NuvioSession } from "../nuvio/types";

type Props = {
  session: NuvioSession | null;
  library: NuvioLibrarySnapshot | null;
  busy: boolean;
  error: string | null;
  onSession: (session: NuvioSession | null) => void;
  onLibrary: (library: NuvioLibrarySnapshot | null) => void;
  onBusy: (busy: boolean) => void;
  onError: (error: string | null) => void;
};

export function AccountPanel({
  session,
  library,
  busy,
  error,
  onSession,
  onLibrary,
  onBusy,
  onError,
}: Props) {
  const [config, setConfig] = useState<NuvioConfig>(() => defaultConfig());
  const [email, setEmail] = useState(session?.email ?? "");
  const [password, setPassword] = useState("");
  const [profileId, setProfileId] = useState(library?.profileId ?? 1);
  const [showKeys, setShowKeys] = useState(!config.supabaseUrl || !config.anonKey);

  const saveKeys = () => {
    saveConfig(config);
    setShowKeys(false);
  };

  const signIn = async () => {
    onError(null);
    onBusy(true);
    try {
      saveConfig(config);
      const next = await signInWithPassword(config, email, password);
      saveSession(next);
      onSession(next);
      const snap = await loadNuvioLibrary(config, next, profileId);
      onLibrary(snap);
      setProfileId(snap.profileId);
      setPassword("");
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      onBusy(false);
    }
  };

  const refresh = async () => {
    if (!session) return;
    onError(null);
    onBusy(true);
    try {
      const fresh = await ensureFreshSession(config, session);
      if (fresh.accessToken !== session.accessToken) {
        onSession(fresh);
      }
      const snap = await loadNuvioLibrary(config, fresh, profileId);
      onLibrary(snap);
      setProfileId(snap.profileId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      onError(msg);
      if (/sign in again|session expired/i.test(msg)) {
        saveSession(null);
        onSession(null);
        onLibrary(null);
      }
    } finally {
      onBusy(false);
    }
  };

  const signOut = () => {
    saveSession(null);
    onSession(null);
    onLibrary(null);
    onError(null);
  };

  const catalogCount = library?.sources.filter((s) => s.kind === "catalog").length ?? 0;
  const collectionCount = library?.sources.filter((s) => s.kind === "collection").length ?? 0;
  const homeRailCount =
    library?.homePack.blocks.filter(
      (b) => b.type === "mediaRail" || b.type === "collectionRail" || b.type === "genreRail",
    ).length ?? 0;

  return (
    <section className="account-panel">
      <h2>Connect</h2>
      <p className="hint">
        Sign in with the same email and password as the TV app. Studio loads your home rail order,
        collections, and catalogs.
      </p>

      <button type="button" className="btn ghost full" onClick={() => setShowKeys((v) => !v)}>
        {showKeys ? "Hide project settings" : "Project settings"}
      </button>

      {showKeys && (
        <div className="inspector-form" style={{ marginTop: 10 }}>
          <label>
            Supabase URL
            <input
              value={config.supabaseUrl}
              placeholder="https://xxxx.supabase.co"
              onChange={(e) => setConfig((c) => ({ ...c, supabaseUrl: e.target.value }))}
            />
          </label>
          <label>
            Anon / publishable key
            <input
              value={config.anonKey}
              placeholder="sb_publishable_… or eyJ…"
              onChange={(e) => setConfig((c) => ({ ...c, anonKey: e.target.value }))}
            />
          </label>
          <button type="button" className="btn ghost full" onClick={saveKeys}>
            Save project settings
          </button>
        </div>
      )}

      {!session ? (
        <div className="inspector-form" style={{ marginTop: 12 }}>
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void signIn();
              }}
            />
          </label>
          <button type="button" className="btn primary full" disabled={busy} onClick={() => void signIn()}>
            {busy ? "Signing in…" : "Sign in & load library"}
          </button>
        </div>
      ) : (
        <div className="account-signed-in">
          <p className="account-email">{session.email}</p>
          {library && library.profiles.length > 0 && (
            <label>
              Profile
              <select
                value={profileId}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setProfileId(next);
                  void (async () => {
                    if (!session) return;
                    onError(null);
                    onBusy(true);
                    try {
                      const fresh = await ensureFreshSession(config, session);
                      if (fresh.accessToken !== session.accessToken) {
                        onSession(fresh);
                      }
                      const snap = await loadNuvioLibrary(config, fresh, next);
                      onLibrary(snap);
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : String(err);
                      onError(msg);
                      if (/sign in again|session expired/i.test(msg)) {
                        saveSession(null);
                        onSession(null);
                        onLibrary(null);
                      }
                    } finally {
                      onBusy(false);
                    }
                  })();
                }}
              >
                {library.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (#{p.id})
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="hint">
            {homeRailCount} home rails · {collectionCount} collections · {catalogCount} catalogs
            {library ? ` · loaded ${new Date(library.loadedAt).toLocaleTimeString()}` : ""}
          </p>
          <div className="rail-section">
            <button type="button" className="btn ghost full" disabled={busy} onClick={() => void refresh()}>
              {busy ? "Loading…" : "Reload my Nuvio home"}
            </button>
            <button type="button" className="btn ghost full danger-text" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      )}

      {error && <p className="account-error">{error}</p>}
    </section>
  );
}
