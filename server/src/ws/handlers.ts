import type { IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { pool } from "../db/pool.js";
import type { DeviceRow } from "../types.js";
import { hub } from "./hub.js";
import { verifyAdminToken } from "../auth/oidc.js";
import { deliverQueuedCommands } from "../services/commandDispatch.js";
import { appUpdateOffer, getCurrentAppBuild } from "../services/appBuilds.js";
import bcrypt from "bcrypt";
import {
  isSignalingMessage,
  describeSignaling,
  SIGNALING_HINT_PAYLOAD,
} from "../services/signalingNormalize.js";
import { recordUnrecognizedDeviceMessage } from "../services/signalingSession.js";
import type { ControlPacket } from "../types.js";

interface DeviceAuthMessage {
  type: "auth";
  uid: string;
  connection_secret: string;
}

interface AdminAuthMessage {
  type: "auth";
  role: "admin";
  uid: string;
  token: string;
}

function previewMessage(message: Record<string, unknown>): string {
  const text = JSON.stringify(message);
  return text.length > 180 ? `${text.slice(0, 180)}…` : text;
}

async function verifyDevice(uid: string, secret: string): Promise<DeviceRow | null> {
  const result = await pool.query<DeviceRow>(
    "SELECT * FROM devices WHERE uid = $1",
    [uid]
  );
  const row = result.rows[0];
  if (!row) return null;
  const match = await bcrypt.compare(secret, row.connection_secret);
  return match ? row : null;
}

async function isValidAdminToken(token: string): Promise<boolean> {
  const result = await verifyAdminToken(token);
  if (result.ok) return true;

  if (result.reason === "forbidden") {
    console.warn(`WebSocket admin token rejected: Account is not authorized (email=${result.user?.email})`);
  } else {
    console.warn("WebSocket admin token rejected: invalid or expired token");
  }
  return false;
}

function isDeviceEvent(message: Record<string, unknown>): boolean {
  if (message.type === "device_event") return true;
  return typeof message.event === "string" && typeof message.uid === "string";
}

export function attachWebSocketHandlers(
  wss: WebSocketServer,
  path: "/ws/device" | "/ws/admin"
): void {
  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    let authenticated = false;
    // Auth is async (DB lookup + bcrypt/JWKS). ws doesn't wait for one message handler before
    // running the next, so a message sent right after auth (e.g. a keepalive) used to be judged
    // "not auth" and closed the socket with 4003. Messages arriving mid-auth wait for it instead.
    let authInFlight: Promise<void> | null = null;
    const authTimeout = setTimeout(() => {
      if (!authenticated) {
        ws.close(4001, "Authentication timeout");
      }
    }, 10000);

    ws.on("message", async (raw) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
        return;
      }

      if (!authenticated && authInFlight) {
        await authInFlight;
        if (!authenticated) return; // auth failed; the socket is closing
      }

      if (!authenticated) {
        // A keepalive can race the auth message on a fresh socket (the Android app reconnects
        // right after registering). Answer it rather than dropping the connection; the 10 s
        // auth timeout above still applies, and any other non-auth message still closes it.
        if (message.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }

        let releaseAuth: () => void = () => {};
        authInFlight = new Promise<void>((resolve) => {
          releaseAuth = resolve;
        });
        try {
          if (path === "/ws/device") {
            const auth = message as unknown as DeviceAuthMessage;
            if (auth.type !== "auth" || !auth.uid || !auth.connection_secret) {
              ws.close(4003, "Device auth required");
              return;
            }

            const device = await verifyDevice(auth.uid, auth.connection_secret);
            if (!device) {
              ws.close(4003, "Invalid credentials");
              return;
            }

            console.log(`Device WebSocket connected: uid=${auth.uid} ip=${req.socket.remoteAddress}`);
            authenticated = true;
            clearTimeout(authTimeout);
            hub.registerDevice(ws, auth.uid, auth.connection_secret);
            // app_update: the console's app build, when the device reports an older version.
            const appUpdate = appUpdateOffer(getCurrentAppBuild(), device.app_version);
            ws.send(JSON.stringify({ type: "auth_ok", uid: auth.uid, ...(appUpdate ? { app_update: appUpdate } : {}) }));

            const pending = await deliverQueuedCommands(auth.uid, (command) =>
              ws.send(JSON.stringify(command))
            );
            if (pending.length > 0) {
              console.log(`WebSocket delivered ${pending.length} queued command(s) to uid=${auth.uid}`);
            }
            return;
          }

          if (path === "/ws/admin") {
            const auth = message as unknown as AdminAuthMessage;
            if (
              auth.type !== "auth" ||
              auth.role !== "admin" ||
              !auth.token ||
              !auth.uid
            ) {
              ws.close(4003, "Admin auth required");
              return;
            }

            const valid = await isValidAdminToken(auth.token);
            if (!valid) {
              ws.close(4003, "Invalid token");
              return;
            }

            authenticated = true;
            clearTimeout(authTimeout);
            hub.registerAdmin(ws, auth.token.slice(0, 16), auth.uid);
            ws.send(JSON.stringify({ type: "auth_ok", uid: auth.uid }));
            return;
          }
        } finally {
          releaseAuth();
          authInFlight = null;
        }
      }

      if (!authenticated) return;

      if (path === "/ws/device") {
        const uid = hub.getClientUid(ws);
        const summary = describeSignaling(message);
        console.log(`Device WS message: ${summary}`);

        if (
          !isSignalingMessage(message) &&
          !isDeviceEvent(message) &&
          message.type !== "webrtc_ready" &&
          message.type !== "ping"
        ) {
          if (uid) {
            recordUnrecognizedDeviceMessage(
              uid,
              `type=${String(message.type ?? "?")} ${previewMessage(message)}`
            );
            hub.sendSignalingStatus(uid);
          }
          console.log(
            `Device WS unrecognized: type=${String(message.type ?? "?")} ${previewMessage(message)}`
          );
        }
      }

      if (isSignalingMessage(message)) {
        hub.relaySignaling(ws, message);
        return;
      }

      if (isDeviceEvent(message)) {
        const clientUid =
          (message.uid as string) ?? hub.getClientUid(ws) ?? "";
        hub.relayDeviceEvent(clientUid, {
          type: "device_event",
          uid: clientUid,
          event: message.event,
          payload: message.payload,
        });
        return;
      }

      if (message.type === "webrtc_ready") {
        const client = hub.getClientUid(ws);
        if (client) {
          console.log(`Device WebRTC ready: uid=${client}`);
          hub.relayDeviceEvent(client, {
            event: "WEBRTC_READY",
            uid: client,
          });
          hub.sendSignalingStatus(client);
        }
        return;
      }

      if (message.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }

      if (message.type === "control" && path === "/ws/admin") {
        const uid = hub.getClientUid(ws);
        const action = message.action as string | undefined;
        if (uid && action) {
          const { type: _type, ...packet } = message;
          hub.sendControl(uid, packet as unknown as ControlPacket);
        }
        return;
      }
    });

    ws.on("close", () => {
      clearTimeout(authTimeout);
      hub.unregister(ws);
    });

    ws.on("error", (err) => {
      console.error("WebSocket error:", err);
      hub.unregister(ws);
    });
  });
}
