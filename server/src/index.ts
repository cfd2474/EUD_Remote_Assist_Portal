import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { WebSocketServer } from "ws";
import { config } from "./config.js";
import { SERVICE_NAME, VERSION } from "./version.js";
import { deviceApiRouter } from "./routes/deviceApi.js";
import { adminApiRouter } from "./routes/adminApi.js";
import { appDownloadRouter } from "./routes/appDownload.js";
import { attachWebSocketHandlers } from "./ws/handlers.js";
import { resetLiveSessionFlags, purgeOldLocationHistory } from "./services/devices.js";
import { purgeExpiredCommands } from "./services/commands.js";
import { getSignalingStatus, pruneIdleSessions } from "./services/signalingSession.js";
import { startViewerPresencePolicy } from "./services/viewerPresence.js";
import { dispatchCommand } from "./services/commandDispatch.js";
import { hub } from "./ws/hub.js";
import { loadPortalSettings } from "./services/portalSettings.js";
import { seedAppBuilds } from "./services/appBuildSeeder.js";

const app = express();

app.set("etag", false);
app.set("trust proxy", 1);

app.use(helmet({ 
  contentSecurityPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true }
}));
app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  next();
});
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/api/v1", (req, res, next) => {
  const started = Date.now();
  res.on("finish", () => {
    console.log(
      `Device API ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms ip=${req.ip}`
    );
  });
  next();
});

const deviceLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: SERVICE_NAME, version: VERSION });
});

app.get("/version", (_req, res) => {
  res.json({ version: VERSION, service: SERVICE_NAME });
});

app.use("/api/v1", deviceLimiter, appDownloadRouter);
app.use("/api/v1", deviceLimiter, deviceApiRouter);
app.use("/api/admin", adminApiRouter);

const server = http.createServer(app);

const deviceWss = new WebSocketServer({ noServer: true });
const adminWss = new WebSocketServer({ noServer: true });

// D8: the remote session ends when the last admin viewer leaves (after a reload grace).
startViewerPresencePolicy({
  onViewerCountChange: (listener) => hub.onViewerCountChange(listener),
  viewerCount: (uid) => hub.viewerCount(uid),
  isRemoteActive: (uid) => getSignalingStatus(uid).remoteActive,
  stopSession: (uid) => dispatchCommand(uid, "STOP_REMOTE_ADMIN"),
});

attachWebSocketHandlers(deviceWss, "/ws/device");
attachWebSocketHandlers(adminWss, "/ws/admin");

server.on("upgrade", (req, socket, head) => {
  const url = req.url ?? "";

  if (url.startsWith("/ws/device")) {
    deviceWss.handleUpgrade(req, socket, head, (ws) => {
      deviceWss.emit("connection", ws, req);
    });
    return;
  }

  if (url.startsWith("/ws/admin")) {
    adminWss.handleUpgrade(req, socket, head, (ws) => {
      adminWss.emit("connection", ws, req);
    });
    return;
  }

  socket.destroy();
});

const DAILY_MAINTENANCE_MS = 24 * 60 * 60 * 1000;
const SIGNALING_PRUNE_MS = 10 * 60 * 1000;

/** Daily: drop location history past retention and queued commands past their TTL. */
async function runDailyMaintenance(): Promise<void> {
  try {
    const deleted = await purgeOldLocationHistory();
    if (deleted > 0) {
      console.log(
        `Purged ${deleted} location history record(s) older than 30 days`
      );
    }
  } catch (err) {
    console.error("Location history purge failed:", err);
  }

  try {
    const expired = await purgeExpiredCommands();
    if (expired > 0) {
      console.log(`Purged ${expired} queued command(s) past their delivery TTL`);
    }
  } catch (err) {
    console.error("Queued command purge failed:", err);
  }
}

function runSignalingPrune(): void {
  const pruned = pruneIdleSessions();
  if (pruned > 0) {
    console.log(`Pruned ${pruned} idle signaling session(s)`);
  }
}

void resetLiveSessionFlags().then(async () => {
  await loadPortalSettings();
  // Import the APK that ships with this release (dist/). A failure must not keep the portal down.
  await seedAppBuilds().catch((err) => console.error("App build import failed:", err));
  await runDailyMaintenance();
  setInterval(runDailyMaintenance, DAILY_MAINTENANCE_MS);
  setInterval(runSignalingPrune, SIGNALING_PRUNE_MS);

  server.listen(config.port, () => {
    console.log(
      `EUD Remote Assist Portal v${VERSION} listening on port ${config.port}`
    );
  });
});
