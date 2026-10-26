import { Router } from "express";
import { getLatestApkRelease } from "../../services/githubReleases.js";
import {
  clearPortalGithubToken,
  getPortalConfigStatus,
  setPortalGithubToken,
  validateGithubToken,
  getGithubApkRepo,
  setTurnSettings,
  clearTurnSettings,
  getIceServers,
  EnvManagedSettingError,
} from "../../services/portalSettings.js";
import { config } from "../../config.js";

/** Site settings (Portal Configuration), runtime client settings, and the latest APK. */
export const portalConfigRouter = Router();

portalConfigRouter.get("/app/latest-apk", async (_req, res) => {
  try {
    const latest = await getLatestApkRelease();
    if (!latest) {
      res.status(404).json({ error: "No APK release found on GitHub" });
      return;
    }
    res.json({ apk: latest });
  } catch (err) {
    console.error("Latest APK lookup error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to fetch latest APK from GitHub";
    res.status(502).json({ error: message });
  }
});

portalConfigRouter.get("/portal-config", (_req, res) => {
  res.json(getPortalConfigStatus());
});

/** Runtime settings the admin UI needs: device API URL, WebRTC ICE servers, map and geocoder. */
portalConfigRouter.get("/client-config", (_req, res) => {
  res.json({
    publicBaseUrl: config.publicBaseUrl,
    iceServers: getIceServers(),
    mapTiles: config.mapTiles.url
      ? { url: config.mapTiles.url, attribution: config.mapTiles.attribution }
      : null,
    geocoderEnabled: Boolean(config.geocoder.url),
  });
});

portalConfigRouter.put("/portal-config/github", async (req, res) => {
  const token = req.body?.token;
  if (typeof token !== "string") {
    res.status(400).json({ error: "token is required" });
    return;
  }

  try {
    const trimmed = token.trim();
    await validateGithubToken(trimmed, getGithubApkRepo());
    await setPortalGithubToken(trimmed);
    res.json({ ok: true, ...getPortalConfigStatus() });
  } catch (err) {
    console.error("Apply GitHub token error:", err);
    res.status(400).json({
      error: err instanceof Error ? err.message : "Failed to apply GitHub token",
    });
  }
});

portalConfigRouter.delete("/portal-config/github", async (_req, res) => {
  try {
    await clearPortalGithubToken();
    res.json({ ok: true, ...getPortalConfigStatus() });
  } catch (err) {
    console.error("Clear GitHub token error:", err);
    res.status(400).json({
      error: err instanceof Error ? err.message : "Failed to clear GitHub token",
    });
  }
});

/** Retired in 3.2.0: the device API port now comes from PUBLIC_BASE_URL. */
portalConfigRouter.put("/portal-config/server-port", (_req, res) => {
  res.status(410).json({
    error: "Server Port is no longer set here. The device API URL comes from PUBLIC_BASE_URL in .env.",
  });
});

portalConfigRouter.put("/portal-config/turn", async (req, res) => {
  const url = req.body?.turnServerUrl;
  const username = req.body?.turnUsername;
  const credential = req.body?.turnCredential;

  if (typeof url !== "string") {
    res.status(400).json({ error: "turnServerUrl is required and must be a string" });
    return;
  }

  try {
    await setTurnSettings(url, username, credential);
    res.json({ ok: true, ...getPortalConfigStatus() });
  } catch (err) {
    console.error("Apply TURN Settings error:", err);
    res.status(err instanceof EnvManagedSettingError ? 409 : 400).json({
      error: err instanceof Error ? err.message : "Failed to apply TURN Settings",
    });
  }
});

portalConfigRouter.delete("/portal-config/turn", async (_req, res) => {
  try {
    await clearTurnSettings();
    res.json({ ok: true, ...getPortalConfigStatus() });
  } catch (err) {
    console.error("Clear TURN Settings error:", err);
    res.status(err instanceof EnvManagedSettingError ? 409 : 400).json({
      error: err instanceof Error ? err.message : "Failed to clear TURN Settings",
    });
  }
});
