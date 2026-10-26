import { useEffect, useState } from "react";
import { useAuth } from "react-oidc-context";
import {
  fetchLatestApk,
  fetchPortalConfig,
  applyPortalTurnSettings,
  clearPortalTurnSettings,
} from "../api/client";
import type { LatestApkRelease, PortalConfig } from "../types";

const shortHash = (hash: string) => `${hash.slice(0, 12)}…${hash.slice(-6)}`;

export function PortalConfiguration() {
  const auth = useAuth();
  const [config, setConfig] = useState<PortalConfig | null>(null);
  const [appBuild, setAppBuild] = useState<LatestApkRelease | null>(null);
  const [appBuildError, setAppBuildError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [turnUrl, setTurnUrl] = useState("");
  const [turnUsername, setTurnUsername] = useState("");
  const [turnCredential, setTurnCredential] = useState("");

  const loadConfig = async () => {
    if (!auth.user) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchPortalConfig(auth.user);
      setConfig(data);
      setTurnUrl(data.turnServerUrl || "");
      try {
        setAppBuild(await fetchLatestApk(auth.user));
        setAppBuildError(null);
      } catch (err) {
        setAppBuild(null);
        setAppBuildError(err instanceof Error ? err.message : "Failed to load the app build");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load portal configuration"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConfig();
  }, [auth.user]);

  const handleApplyTurn = async () => {
    if (!auth.user || !turnUrl.trim()) return;
    setApplying(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const data = await applyPortalTurnSettings(
        auth.user,
        turnUrl.trim(),
        turnUsername.trim(),
        turnCredential.trim()
      );
      setConfig(data);
      setSuccessMessage("TURN server settings applied.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply TURN settings");
    } finally {
      setApplying(false);
    }
  };

  const handleClearTurn = async () => {
    if (!auth.user) return;
    setClearing(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const data = await clearPortalTurnSettings(auth.user);
      setConfig(data);
      setTurnUrl("");
      setTurnUsername("");
      setTurnCredential("");
      setSuccessMessage("TURN server settings removed. Remote view now uses STUN only.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear TURN settings");
    } finally {
      setClearing(false);
    }
  };

  const turnEnvManaged = config?.turnSource === "environment";

  return (
    <div className="page portal-configuration-page">
      <div className="page-header">
        <h1>Portal Configuration</h1>
        <p>Site settings for this portal installation.</p>
      </div>

      {loading ? <p className="loading">Loading configuration…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {successMessage ? <p className="action-message">{successMessage}</p> : null}

      {config ? (
        <section className="panel portal-config-panel">
          <h2>App build</h2>
          <p className="portal-config-intro">
            This console hosts the EUD Remote Assist app itself. The APK ships with each portal
            release (in <code>dist/</code>) and is imported when the server starts, so the
            Download page and device update checks never contact GitHub. Devices on an older
            version are offered this build.
          </p>
          {appBuild ? (
            <>
              <div className="portal-config-status">
                <span className="badge badge-online">
                  Version {appBuild.version} (versionCode {appBuild.versionCode})
                </span>
              </div>
              <dl className="portal-config-details">
                <dt>Download</dt>
                <dd><code>{appBuild.downloadUrl}</code></dd>
                <dt>File SHA-256</dt>
                <dd><code title={appBuild.sha256}>{shortHash(appBuild.sha256)}</code></dd>
                <dt>Signing certificate SHA-256</dt>
                <dd><code title={appBuild.signerSha256}>{shortHash(appBuild.signerSha256)}</code></dd>
                <dt>Size</dt>
                <dd>{(appBuild.size / (1024 * 1024)).toFixed(1)} MB</dd>
                <dt>Imported</dt>
                <dd>{new Date(appBuild.importedAt).toLocaleString()}</dd>
              </dl>
            </>
          ) : (
            <div className="portal-config-status">
              <span className="badge badge-offline">{appBuildError ?? "No app build"}</span>
            </div>
          )}
        </section>
      ) : null}

      {config ? (
        <section className="panel portal-config-panel" style={{ marginTop: "2rem" }}>
          <h2>Device API URL</h2>
          <p className="portal-config-intro">
            Devices enroll and connect to this address. Enrollment QR codes and MDM configs use it,
            and so does the server's registration response. It comes from{" "}
            <code>PUBLIC_BASE_URL</code> in the server <code>.env</code> file; change it there and
            restart the stack.
          </p>
          <div className="portal-config-status">
            {config.publicBaseUrl ? (
              <span className="badge badge-online">{config.publicBaseUrl}</span>
            ) : (
              <span className="badge badge-offline">Not set: enrollment QR codes are unavailable</span>
            )}
          </div>
          {config.serverPortMismatch ? (
            <p className="portal-config-env-note">
              A Server Port of <strong>{config.legacyServerPort}</strong> was saved on this page
              before version 3.2.0, but <code>PUBLIC_BASE_URL</code> uses port{" "}
              <strong>{config.devicePort ?? "unknown"}</strong>. QR codes now follow{" "}
              <code>PUBLIC_BASE_URL</code>. If devices should use port {config.legacyServerPort},
              put it in <code>PUBLIC_BASE_URL</code>.
            </p>
          ) : null}
        </section>
      ) : null}

      {config ? (
        <section className="panel portal-config-panel" style={{ marginTop: "2rem" }}>
          <h2>TURN Server</h2>
          <p className="portal-config-intro">
            A TURN server relays remote-view video when the device and this browser cannot reach
            each other directly (strict NAT, firewalls). Both the admin browser and the device use
            it. URL format: <code>turn:host:port</code> (infra-TAK&apos;s CoTURN listens on 3479).
          </p>

          <div className="portal-config-status">
            {config.turnServerUrl ? (
              <span className="badge badge-online">
                {turnEnvManaged ? "Configured in server environment: " : "Active: "}
                {config.turnServerUrl} {config.turnCredentialConfigured ? "(Authenticated)" : ""}
              </span>
            ) : (
              <span className="badge badge-offline">No TURN server: remote view uses STUN only</span>
            )}
          </div>

          {turnEnvManaged ? (
            <p className="portal-config-env-note">
              TURN is set by <code>TURN_URL</code> in the server <code>.env</code> file. Change it
              there, or remove it to manage TURN from this page instead.
            </p>
          ) : (
          <div className="portal-config-form">
            <label className="filter-field portal-config-token-field">
              <span>Server URL</span>
              <input
                type="text"
                value={turnUrl}
                onChange={(event) => setTurnUrl(event.target.value)}
                placeholder="turn:turn.domain.com:port"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="filter-field portal-config-token-field">
              <span>Username (Optional)</span>
              <input
                type="text"
                value={turnUsername}
                onChange={(event) => setTurnUsername(event.target.value)}
                placeholder="username"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="filter-field portal-config-token-field">
              <span>Credential/Password (Optional)</span>
              <input
                type="password"
                value={turnCredential}
                onChange={(event) => setTurnCredential(event.target.value)}
                placeholder="password"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <div className="portal-config-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={applying || !turnUrl.trim()}
                onClick={() => void handleApplyTurn()}
              >
                {applying ? "Applying…" : "Apply"}
              </button>
              {config.turnServerUrl ? (
                <button
                  type="button"
                  disabled={clearing}
                  onClick={() => void handleClearTurn()}
                >
                  {clearing ? "Removing…" : "Remove TURN Config"}
                </button>
              ) : null}
            </div>
          </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
