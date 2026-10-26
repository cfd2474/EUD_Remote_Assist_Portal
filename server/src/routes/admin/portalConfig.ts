import { Router } from "express";
import {
  appDownloadFilename,
  appDownloadUrl,
  getCurrentAppBuild,
} from "../../services/appBuilds.js";
import { readAppReleaseNotes } from "../../services/appReleaseNotes.js";
import {
  getPortalConfigStatus,
  setTurnSettings,
  clearTurnSettings,
  getIceServers,
  EnvManagedSettingError,
} from "../../services/portalSettings.js";
import { config } from "../../config.js";

/** Site settings (Portal Configuration), runtime client settings, and the hosted APK. */
export const portalConfigRouter = Router();

/** The app build this console hosts (imported from dist/ at startup). */
portalConfigRouter.get("/app/latest-apk", async (_req, res) => {
  const build = getCurrentAppBuild();
  if (!build) {
    res.status(404).json({
      error: "This console has no app build. The APK ships in dist/ with each portal release.",
    });
    return;
  }
  res.json({
    apk: {
      version: build.versionName,
      versionCode: build.versionCode,
      filename: appDownloadFilename(build),
      downloadUrl: appDownloadUrl(),
      releaseTag: `v${build.versionName}`,
      releaseNotes: await readAppReleaseNotes(build.versionName),
      sha256: build.sha256,
      signerSha256: build.signerSha256,
      size: build.size,
      importedAt: build.createdAt,
    },
  });
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

/** Retired in 3.3.0: the console hosts the APK, so it needs no GitHub token. */
portalConfigRouter.all("/portal-config/github", (_req, res) => {
  res.status(410).json({ error: "The GitHub token setting was retired in 3.3.0: the console hosts the app APK itself." });
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
