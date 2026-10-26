import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { removeDevice, sendCommand } from "../api/client";
import { useAdminWebSocket } from "../hooks/useAdminWebSocket";
import { useActionBanner } from "../hooks/device/useActionBanner";
import { useDeviceRecord } from "../hooks/device/useDeviceRecord";
import { useInactivityTimeout } from "../hooks/device/useInactivityTimeout";
import { useLatestApkVersion } from "../hooks/device/useLatestApkVersion";
import { useRemoteUnlock } from "../hooks/device/useRemoteUnlock";
import { useStreamLayout } from "../hooks/device/useStreamLayout";
import { DeviceLocationPanel } from "../components/DeviceLocationPanel";
import { ConfirmModal } from "../components/ConfirmModal";
import { RemoteViewer } from "../components/RemoteViewer";
import type { Device, DeviceCommand } from "../types";
import { isLayoutEvent } from "../utils/streamDimensions";
import { formatPhoneNumber } from "../utils/formatPhoneNumber";
import { isNewerVersion } from "../utils/compareSemver";
import { queuedExpiryText } from "../utils/queuedExpiry";

export function DeviceDetail() {
  const { uid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const auth = useAuth();

  const { connected, deviceOnline, deviceReconnecting, lastEvent, signalingStatus, sendWebRtc, sendControl, setWebRtcHandler } =
    useAdminWebSocket(uid, auth.user ?? null);
  const banner = useActionBanner(deviceOnline);
  const { show: showBanner, clear: clearBanner } = banner;
  const layout = useStreamLayout();
  const unlock = useRemoteUnlock(auth.user, uid, banner);
  const latestApkVersion = useLatestApkVersion(auth.user);

  const [remoteActive, setRemoteActive] = useState(false);
  // Each Connect starts a new session id; WEBRTC_READY only counts for the current one.
  const [remoteSessionId, setRemoteSessionId] = useState(0);
  const [webrtcReadySessionId, setWebrtcReadySessionId] = useState(0);
  const remoteSessionIdRef = useRef(0);
  const [removing, setRemoving] = useState(false);
  const [removeModalOpen, setRemoveModalOpen] = useState(false);
  const [lockModalOpen, setLockModalOpen] = useState(false);
  const [constrainedModalOpen, setConstrainedModalOpen] = useState(false);
  const [locking, setLocking] = useState(false);

  // The server's remote_admin_active seeds the page once; later polls can only turn it on.
  const onDeviceLoaded = useCallback((data: Device, isFirstLoad: boolean) => {
    if (isFirstLoad) {
      setRemoteActive(data.remote_admin_active);
    } else if (data.remote_admin_active) {
      setRemoteActive(true);
    }
  }, []);
  const { device, loading, error, refresh: refreshDeviceMeta } = useDeviceRecord(auth.user, uid, onDeviceLoaded);

  const { reset: resetUnlock, markLocked, onUnlockHandled, onUnlockFailed } = unlock;
  const { apply: applyLayout, reset: resetLayout } = layout;

  const runCommand = useCallback(async (command: DeviceCommand) => {
    if (!auth.user || !uid) return;
    clearBanner();
    try {
      const result = await sendCommand(auth.user, uid, command);
      if (command === "START_REMOTE_ADMIN") {
        setRemoteActive(true);
        remoteSessionIdRef.current += 1;
        setRemoteSessionId(remoteSessionIdRef.current);
        setWebrtcReadySessionId(0);
      }
      if (command === "STOP_REMOTE_ADMIN") {
        setRemoteActive(false);
        resetUnlock();
      }
      const isQueued = result.delivery === "queued";
      const message = isQueued
        ? `Command queued: ${command} — the device is not connected right now. It receives queued commands on its next check-in (usually within ~30 s); if it does not check in within ${queuedExpiryText(result.expiresInSeconds)}, the command expires and must be sent again.`
        : `Command sent: ${command}`;
      showBanner(message, isQueued, command);
      void refreshDeviceMeta();
    } catch (err) {
      showBanner(err instanceof Error ? err.message : "Command failed");
    }
  }, [auth.user, uid, refreshDeviceMeta, showBanner, clearBanner, resetUnlock]);

  const inactivity = useInactivityTimeout(remoteActive, () => void runCommand("STOP_REMOTE_ADMIN"));

  // Events the device sends during a session.
  useEffect(() => {
    if (lastEvent?.event === "WEBRTC_READY") {
      setWebrtcReadySessionId(remoteSessionIdRef.current);
      resetUnlock();
    }
    if (isLayoutEvent(String(lastEvent?.event))) {
      applyLayout(lastEvent?.payload);
    }
    if (lastEvent?.event === "DEVICE_LOCKED") {
      const payload = lastEvent.payload as Record<string, unknown> | undefined;
      markLocked(typeof payload?.reason === "string" ? payload.reason : "PIN required for full access");
    }
    if (lastEvent?.event === "WEBRTC_UNAVAILABLE") {
      setConstrainedModalOpen(true);
    }
    if (lastEvent?.event === "COMMAND_HANDLED") {
      const payload = lastEvent.payload as Record<string, unknown> | undefined;
      if (payload?.command === "REMOTE_UNLOCK") onUnlockHandled();
    }
    if (lastEvent?.event === "COMMAND_FAILED") {
      const payload = lastEvent.payload as Record<string, unknown> | undefined;
      if (payload?.command === "REMOTE_UNLOCK") {
        onUnlockFailed(typeof payload?.error === "string" ? payload.error : "Command failed");
      }
    }
  }, [lastEvent, resetUnlock, applyLayout, markLocked, onUnlockHandled, onUnlockFailed]);

  // Ending a session clears what belonged to it. (The inactivity prompt resets itself.)
  useEffect(() => {
    if (!remoteActive) {
      resetLayout();
      resetUnlock();
    }
  }, [remoteActive, resetLayout, resetUnlock]);

  // Leaving the page (navigation, reload, closed tab) does not stop the remote session itself:
  // the server stops it once the last admin viewer has gone (D8, services/viewerPresence.ts).

  const handleLockDevice = async () => {
    if (!auth.user || !uid) return;

    setLockModalOpen(false);
    setLocking(true);
    clearBanner();

    try {
      if (remoteActive) {
        await sendCommand(auth.user, uid, "STOP_REMOTE_ADMIN");
        setRemoteActive(false);
      }

      const result = await sendCommand(auth.user, uid, "LOCK_DEVICE");
      const isQueued = result.delivery === "queued";
      const message = isQueued
        ? `Lock command queued — the device locks on its next check-in (expires after ${queuedExpiryText(result.expiresInSeconds)}). Remote assist has been stopped.`
        : "Lock command sent. Remote assist has been stopped.";
      showBanner(message, isQueued, "LOCK_DEVICE");
      void refreshDeviceMeta();
    } catch (err) {
      showBanner(err instanceof Error ? err.message : "Lock command failed");
    } finally {
      setLocking(false);
    }
  };

  const handleRemoveDevice = async () => {
    if (!auth.user || !uid || !device) return;

    setRemoveModalOpen(false);
    setRemoving(true);
    clearBanner();
    try {
      await removeDevice(auth.user, uid);
      navigate("/", { replace: true });
    } catch (err) {
      showBanner(err instanceof Error ? err.message : "Failed to remove device");
      setRemoving(false);
    }
  };

  if (loading) return <p className="loading">Loading device…</p>;
  if (error || !device) return <p className="error">{error ?? "Device not found"}</p>;

  const hasLocation = device.last_lat != null && device.last_lon != null;
  const newerApkAvailable = isNewerVersion(latestApkVersion, device.app_version);
  const deviceStreamReady =
    remoteSessionId > 0 &&
    webrtcReadySessionId === remoteSessionId &&
    (lastEvent?.event === "WEBRTC_READY" ||
      lastEvent?.event === "REMOTE_SESSION_STARTED" ||
      lastEvent?.event === "REMOTE_READY");

  return (
    <div className="page">
      <div className="page-header">
        <Link to="/" className="back-link">
          ← All devices
        </Link>
        <h1>{device.device_name}</h1>
        <div className="device-meta">
          <span
            className={`badge ${
              deviceOnline
                ? "badge-online"
                : deviceReconnecting
                  ? "badge-neutral"
                  : "badge-offline"
            }`}
          >
            {deviceOnline
              ? "Live"
              : deviceReconnecting
                ? "Reconnecting…"
                : "Not connected"}
          </span>
          <span className="badge badge-neutral">
            WS {connected ? "connected" : "disconnected"}
          </span>
          {remoteActive && (
            <span className="badge badge-remote">Remote active</span>
          )}
        </div>
      </div>

      {banner.message && (
        <p className={`action-message ${banner.fadeClass}`} role="status">
          {banner.message}
        </p>
      )}

      <section className="panel">
        <h2>Actions</h2>
        <div className="action-row">
          <button
            type="button"
            className="btn-sound"
            onClick={() => void runCommand("TRIGGER_PING")}
          >
            Play Sound on Device
          </button>
          <button
            type="button"
            className="btn-locate"
            onClick={() => void runCommand("REQUEST_LOCATION")}
          >
            Locate Device
          </button>
          {!remoteActive ? (
            <button
              type="button"
              className="btn-connect"
              onClick={() => void runCommand("START_REMOTE_ADMIN")}
            >
              Connect
            </button>
          ) : (
            <button
              type="button"
              className="btn-disconnect"
              onClick={() => void runCommand("STOP_REMOTE_ADMIN")}
            >
              Disconnect
            </button>
          )}
          <button
            type="button"
            className="btn-resync"
            onClick={() => void runCommand("RESYNC_DEVICE_INFO")}
          >
            Re-Sync Device Info
          </button>
          <button
            type="button"
            className="btn-lock"
            disabled={locking}
            onClick={() => setLockModalOpen(true)}
          >
            Lock Device
          </button>
        </div>
      </section>

      <ConfirmModal
        open={lockModalOpen}
        title="Lock device?"
        confirmLabel="Lock device"
        confirmClassName="btn-lock"
        onConfirm={() => void handleLockDevice()}
        onCancel={() => setLockModalOpen(false)}
      >
        <p>
          Locking screen will power off the screen and initiate a screen lock if one is present.
        </p>
      </ConfirmModal>

      <ConfirmModal
        open={constrainedModalOpen}
        title="WebRTC Unavailable"
        confirmLabel="Ok"
        onConfirm={() => setConstrainedModalOpen(false)}
        onCancel={() => setConstrainedModalOpen(false)}
      >
        <p>WebRTC is unavailable because the device is on a constrained network.</p>
      </ConfirmModal>

      <ConfirmModal
        open={inactivity.promptOpen}
        title="Stay connected?"
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={inactivity.keepActive}
        onCancel={inactivity.endNow}
      >
        <p>
          You have been inactive for 5 minutes. The remote assist session will disconnect in {inactivity.countdown} seconds unless you choose to stay connected.
        </p>
      </ConfirmModal>

      <ConfirmModal
        open={removeModalOpen}
        title="Remove device?"
        confirmLabel="Remove Device & Clear Data"
        confirmClassName="btn-remove"
        onConfirm={() => void handleRemoveDevice()}
        onCancel={() => setRemoveModalOpen(false)}
      >
        <p>
          Remove &ldquo;{device.device_name}&rdquo; from the portal? This
          permanently deletes the device record, telemetry history, and event
          log. The phone can register again later as a new enrollment.
        </p>
      </ConfirmModal>

      <div className="detail-grid">
        <section className="panel">
          <h2>Device info</h2>
          <dl className="info-list">
            <div>
              <dt>Device name</dt>
              <dd>{device.device_name}</dd>
            </div>
            <div>
              <dt>UID</dt>
              <dd>{device.uid}</dd>
            </div>
            <div>
              <dt>Agency</dt>
              <dd>{device.agency ?? "—"}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{formatPhoneNumber(device.phone_number)}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{device.model_display}</dd>
            </div>
            <div className="info-list-app-version">
              <dt>App version</dt>
              <dd>{device.app_version ?? "—"}</dd>
              {newerApkAvailable ? (
                <p className="app-version-update-banner" role="status">
                  Newer application version available
                </p>
              ) : null}
            </div>
            <div>
              <dt>Battery</dt>
              <dd>
                {device.last_battery != null
                  ? `${device.last_battery}%${device.last_is_charging ? " (charging)" : ""}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Last seen</dt>
              <dd>
                {device.last_seen_at
                  ? new Date(device.last_seen_at).toLocaleString()
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Last telemetry</dt>
              <dd>
                {device.last_telemetry_at
                  ? new Date(device.last_telemetry_at).toLocaleString()
                  : "—"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="panel">
          <h2>Location</h2>
          {hasLocation ? (
            <DeviceLocationPanel
              uid={device.uid}
              lat={device.last_lat!}
              lon={device.last_lon!}
              accuracyM={device.last_location_accuracy_m}
              label={device.device_name}
              user={auth.user!}
            />
          ) : (
            <p className="empty-state">No location data yet.</p>
          )}
        </section>
      </div>

      <section className="panel">
        <h2>Remote assist</h2>
        {remoteActive && unlock.locked && (
          <div className="remote-unlock-panel">
            <p className="remote-unlock-title">Device is locked</p>
            <p className="remote-unlock-reason">
              {unlock.reason ?? "PIN required for full access"}
            </p>
            <div className="remote-unlock-form">
              <input
                type="password"
                className="remote-unlock-input"
                placeholder="Device PIN"
                value={unlock.pin}
                onChange={(event) => unlock.setPin(event.target.value)}
                autoComplete="one-time-code"
                data-lpignore="true"
                data-1pignore="true"
                aria-label="Device PIN"
              />
              <button
                type="button"
                className="btn-unlock"
                disabled={unlock.unlocking || !unlock.pin.trim()}
                onClick={() => void unlock.submit()}
              >
                {unlock.unlocking ? "Standby, unlocking" : "Unlock"}
              </button>
            </div>
          </div>
        )}
        <RemoteViewer
          uid={device.uid}
          user={auth.user!}
          sendWebRtc={sendWebRtc}
          sendControl={sendControl}
          onSignaling={setWebRtcHandler}
          active={remoteActive}
          deviceOnline={deviceOnline || deviceReconnecting}
          deviceReconnecting={deviceReconnecting}
          adminWsConnected={connected}
          deviceStreamReady={deviceStreamReady}
          serverAnswerReceived={signalingStatus?.answerReceived ?? false}
          streamLayoutHint={layout.hint}
          streamLayoutRevision={layout.revision}
          deviceOrientation={layout.orientation}
          onActivity={inactivity.recordActivity}
        />
      </section>

      <section className="panel panel-danger">
        <h2>Remove device</h2>
        <p>
          Permanently delete this device and all associated telemetry and event
          history from the portal.
        </p>
        <button
          type="button"
          className="btn-remove"
          disabled={removing}
          onClick={() => setRemoveModalOpen(true)}
        >
          {removing ? "Removing…" : "Remove Device & Clear Data"}
        </button>
      </section>
    </div>
  );
}
