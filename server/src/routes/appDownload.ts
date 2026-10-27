import { Router } from "express";
import { stat } from "node:fs/promises";
import {
  appBuildFilePath,
  appDownloadFilename,
  appUpdateOffer,
  getCurrentAppBuild,
} from "../services/appBuilds.js";

/**
 * The app APK this console hosts, unauthenticated, under /api/v1 so infra-TAK's Caddy passes it
 * on the device port. Integrity comes from the signature Android checks on install; the
 * SHA-256 is published here and in update offers.
 */
export const appDownloadRouter = Router();

appDownloadRouter.get("/app/latest", (_req, res) => {
  const offer = appUpdateOffer(getCurrentAppBuild(), null);
  if (!offer) {
    res.status(404).json({ error: "This console has no app build" });
    return;
  }
  res.set("Cache-Control", "no-cache").json(offer);
});

appDownloadRouter.get("/app/apk", async (_req, res) => {
  const build = getCurrentAppBuild();
  if (!build) {
    res.status(404).json({ error: "This console has no app build" });
    return;
  }
  const file = appBuildFilePath(build);
  try {
    await stat(file);
  } catch {
    console.error(`App build ${build.versionName} is recorded but its file is missing: ${file}`);
    res.status(503).json({ error: "The app build is temporarily unavailable" });
    return;
  }
  res.set({
    "Content-Type": "application/vnd.android.package-archive",
    "Content-Disposition": `attachment; filename="${appDownloadFilename(build)}"`,
    "Cache-Control": "no-cache",
    ETag: `"${build.sha256}"`,
    "X-Content-SHA256": build.sha256,
  });
  res.sendFile(file, (err) => {
    if (err && !res.headersSent) res.status(500).end();
  });
});
