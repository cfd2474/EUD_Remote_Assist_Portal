import { useEffect, useState } from "react";
import { useAuth } from "react-oidc-context";
import {
  applyPortalGithubToken,
  clearPortalGithubToken,
  fetchPortalConfig,
  applyPortalTurnSettings,
  clearPortalTurnSettings,
} from "../api/client";
import type { PortalGithubConfig } from "../types";

export function PortalConfiguration() {
  const auth = useAuth();
  const [config, setConfig] = useState<PortalGithubConfig | null>(null);
  const [token, setToken] = useState("");
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

  const handleApply = async () => {
    if (!auth.user || !token.trim()) {
      return;
    }

    setApplying(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const data = await applyPortalGithubToken(auth.user, token.trim());
      setConfig(data);
      setToken("");
      setSuccessMessage(
        "GitHub token applied. APK version checks now use unthrottled repo access."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply GitHub token");
    } finally {
      setApplying(false);
    }
  };

  const handleClear = async () => {
    if (!auth.user) {
      return;
    }

    setClearing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const data = await clearPortalGithubToken(auth.user);
      setConfig(data);
      setToken("");
      setSuccessMessage(
        "GitHub token removed. The portal will use standard unauthenticated GitHub lookup."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear GitHub token");
    } finally {
      setClearing(false);
    }
  };

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

  const envManaged = config?.tokenSource === "environment";
  const portalManaged = config?.tokenSource === "portal";
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
          <h2>GitHub APK access</h2>
          <p className="portal-config-intro">
            The Download page and device app-version checks read release metadata
            from <strong>{config.apkRepo}</strong>. By default the portal uses
            standard unauthenticated GitHub lookup. Adding a personal access token
            gives this server <strong>unthrottled access to the GitHub repo</strong>{" "}
            and improves reliability when checking for the latest APK.
          </p>

          <div className="portal-config-status">
            {config.tokenConfigured ? (
              <span className="badge badge-online">
                {envManaged
                  ? "Token configured in server environment (.env)"
                  : "GitHub token active"}
              </span>
            ) : (
              <span className="badge badge-offline">Using standard lookup (no token)</span>
            )}
          </div>

          <div className="portal-config-instructions">
            <h3>Create a classic GitHub token</h3>
            <ol>
              <li>
                Sign in to GitHub and open <strong>Settings</strong> →{" "}
                <strong>Developer settings</strong> →{" "}
                <strong>Personal access tokens</strong> →{" "}
                <strong>Tokens (classic)</strong>.
              </li>
              <li>Choose <strong>Generate new token (classic)</strong>.</li>
              <li>
                Select the <strong>public_repo</strong> scope (read access to public
                repositories).
              </li>
              <li>Generate the token and copy the value (shown once).</li>
              <li>Paste it below and click <strong>Apply</strong>.</li>
            </ol>
            <p className="portal-config-note">
              Use a token created on <em>this</em> server&apos;s GitHub account.
              Do not share tokens between installations.
            </p>
          </div>

          {envManaged ? (
            <p className="portal-config-env-note">
              A GitHub token is already set via <code>GITHUB_TOKEN</code> in the
              server <code>.env</code> file. Remove it there to manage the token
              from this page instead.
            </p>
          ) : (
            <div className="portal-config-form">
              <label className="filter-field portal-config-token-field">
                <span>GitHub classic token (public_repo)</span>
                <input
                  type="password"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="ghp_xxxxxxxx"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <div className="portal-config-actions">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={applying || !token.trim()}
                  onClick={() => void handleApply()}
                >
                  {applying ? "Applying…" : "Apply"}
                </button>
                {portalManaged ? (
                  <button
                    type="button"
                    disabled={clearing}
                    onClick={() => void handleClear()}
                  >
                    {clearing ? "Removing…" : "Remove token"}
                  </button>
                ) : null}
              </div>
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
