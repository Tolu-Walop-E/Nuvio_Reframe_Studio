import { useMemo, useState } from "react";
import { copyText, viewPackInstallUrl } from "../views/publishViewPack";
import "./InstallPage.css";

function packUrlFromLocation(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const url = params.get("url")?.trim() ?? "";
    if (!url) return null;
    const lower = url.toLowerCase();
    if (!lower.startsWith("https://") && !lower.startsWith("http://")) return null;
    return url;
  } catch {
    return null;
  }
}

export function InstallPage() {
  const packUrl = useMemo(() => packUrlFromLocation(), []);
  const installUrl = packUrl ? viewPackInstallUrl(packUrl) : null;
  const [message, setMessage] = useState<string | null>(null);

  const copyInstall = async () => {
    if (!installUrl) return;
    const ok = await copyText(installUrl);
    setMessage(ok ? "Install link copied — open it on the TV or paste in Layout → Import." : "Could not copy.");
  };

  const copyHttps = async () => {
    if (!packUrl) return;
    const ok = await copyText(packUrl);
    setMessage(ok ? "HTTPS pack URL copied — paste in Nuvio Layout → Import." : "Could not copy.");
  };

  if (!packUrl || !installUrl) {
    return (
      <div className="install-page">
        <div className="install-card">
          <p className="install-brand">Nuvio Reframe</p>
          <h1>Install view pack</h1>
          <p className="install-lead">
            Missing pack URL. Publish from Studio with <strong>Send to TV</strong>, then open the install
            page link.
          </p>
          <a className="install-secondary" href="/">
            Back to Studio
          </a>
        </div>
      </div>
    );
  }

  const isHttps = packUrl.toLowerCase().startsWith("https://");

  return (
    <div className="install-page">
      <div className="install-card">
        <p className="install-brand">Nuvio Reframe</p>
        <h1>Install on Nuvio</h1>
        <p className="install-lead">
          Same idea as addon install: open the deep link on your TV, or paste the HTTPS URL in Layout →
          Studio View Pack → Import.
        </p>

        {isHttps ? (
          <a className="install-primary" href={installUrl}>
            Install on Nuvio
          </a>
        ) : (
          <p className="install-warn">
            This pack is on a LAN URL (not HTTPS). Use <strong>Copy HTTPS / pack URL</strong> and Import on
            the TV while Studio is open on the same Wi‑Fi. Deep-link install requires HTTPS.
          </p>
        )}

        <div className="install-actions">
          <button type="button" className="install-ghost" onClick={() => void copyInstall()}>
            Copy install link
          </button>
          <button type="button" className="install-ghost" onClick={() => void copyHttps()}>
            Copy pack URL
          </button>
        </div>

        <code className="install-url" title={installUrl}>
          {installUrl}
        </code>
        <code className="install-url quiet" title={packUrl}>
          {packUrl}
        </code>

        {message ? <p className="install-msg">{message}</p> : null}

        <a className="install-secondary" href="/">
          Back to Studio
        </a>
      </div>
    </div>
  );
}
