import { useEffect, useRef, useState, useCallback } from "react";
import type { User } from "oidc-client-ts";
import type { SignalingStatus, ControlPacket } from "../types";
import { isAuthRejection, reconnectDelayMs } from "../utils/reconnectDelay";

const WS_BASE = import.meta.env.VITE_WS_BASE ?? "";
const DEVICE_OFFLINE_DEBOUNCE_MS = 6_000;

export function useAdminWebSocket(uid: string | undefined, user: User | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const offlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState(false);
  const [deviceOnline, setDeviceOnline] = useState(false);
  const [deviceReconnecting, setDeviceReconnecting] = useState(false);
  const [lastEvent, setLastEvent] = useState<Record<string, unknown> | null>(
    null
  );
  const [signalingStatus, setSignalingStatus] = useState<SignalingStatus | null>(
    null
  );
  const onWebRtcRef = useRef<((msg: Record<string, unknown>) => void) | null>(
    null
  );

  const clearOfflineTimer = useCallback(() => {
    if (offlineTimerRef.current) {
      clearTimeout(offlineTimerRef.current);
      offlineTimerRef.current = null;
    }
  }, []);

  const markDeviceOnline = useCallback(() => {
    clearOfflineTimer();
    setDeviceReconnecting(false);
    setDeviceOnline(true);
  }, [clearOfflineTimer]);

  const markDeviceOfflineSoon = useCallback(() => {
    clearOfflineTimer();
    setDeviceReconnecting(true);
    offlineTimerRef.current = setTimeout(() => {
      offlineTimerRef.current = null;
      setDeviceReconnecting(false);
      setDeviceOnline(false);
    }, DEVICE_OFFLINE_DEBOUNCE_MS);
  }, [clearOfflineTimer]);

  const sendWebRtc = useCallback((message: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "webrtc", ...message }));
    }
  }, []);

  const sendControl = useCallback((packet: ControlPacket): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "control", ...packet }));
      return true;
    }
    return false;
  }, []);

  const setWebRtcHandler = useCallback(
    (handler: (msg: Record<string, unknown>) => void) => {
      onWebRtcRef.current = handler;
    },
    []
  );

  useEffect(() => {
    if (!uid || !user?.access_token) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = WS_BASE || `${protocol}//${window.location.host}`;
    const token = user.access_token;
    let disposed = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    // Reconnects with backoff after drops (server restart, network blip). The server keeps a
    // remote session alive for a short grace when the last viewer disconnects, so a quick
    // reconnect resumes it.
    const connect = () => {
      const ws = new WebSocket(`${host}/ws/admin`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "auth", role: "admin", uid, token }));
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as Record<string, unknown>;

        if (msg.type === "auth_ok") {
          attempt = 0;
          setConnected(true);
          return;
        }

        if (msg.type === "device_status") {
          if (msg.online) {
            markDeviceOnline();
          } else {
            markDeviceOfflineSoon();
          }
          return;
        }

        if (msg.type === "webrtc") {
          onWebRtcRef.current?.(msg);
          return;
        }

        if (msg.type === "device_event") {
          setLastEvent(msg);
          return;
        }

        if (msg.type === "signaling_status") {
          const status = msg as unknown as SignalingStatus;
          setSignalingStatus(status);
          if (status.deviceWsConnected) {
            markDeviceOnline();
          }
        }
      };

      ws.onclose = (event) => {
        if (wsRef.current === ws) wsRef.current = null;
        setConnected(false);
        if (disposed) return;
        // Our own link dropped; we don't know the device's state, so don't flash it offline.
        markDeviceOfflineSoon();
        if (isAuthRejection(event.code)) {
          // A new token (silent renew) re-runs this effect; retrying this one can't succeed.
          return;
        }
        retryTimer = setTimeout(connect, reconnectDelayMs(attempt++));
      };
    };

    connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      clearOfflineTimer();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [uid, user?.access_token, markDeviceOnline, markDeviceOfflineSoon, clearOfflineTimer]);

  return {
    connected,
    deviceOnline,
    deviceReconnecting,
    lastEvent,
    signalingStatus,
    sendWebRtc,
    sendControl,
    setWebRtcHandler,
  };
}
