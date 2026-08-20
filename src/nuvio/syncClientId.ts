const STORAGE_KEY = "nuvio_reframe_studio.syncClientId";
const PREFIX = "nuvio-studio-";
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Stable origin client id for sync RPCs (`^[A-Za-z0-9_-]{16,96}$`). */
export function getStudioSyncClientId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)?.trim();
    if (stored && /^[A-Za-z0-9_-]{16,96}$/.test(stored)) return stored;
  } catch {
    /* private mode */
  }
  let body = "";
  for (let i = 0; i < 32; i += 1) {
    body += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  const id = `${PREFIX}${body}`;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}
