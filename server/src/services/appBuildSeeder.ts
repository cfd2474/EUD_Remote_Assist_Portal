import { copyFile, mkdir, readdir, readFile, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { fileSha256, inspectApk, type ApkInfo } from "./apk/inspect.js";
import {
  appBuildFilePath,
  findAnyAppBuild,
  findAppBuildBySha256,
  findAppBuildByVersionCode,
  insertAppBuild,
  refreshCurrentAppBuild,
  type AppBuild,
} from "./appBuilds.js";

/**
 * Imports the APKs that ship with this release (dist/, mounted read-only at the seed folder)
 * into the console's store. Guards (TAK-MDM model, see PROJECT_STATE "console hosts the APK"):
 *   - package must be the EUD Remote Assist app;
 *   - signer must match SIGNER.sha256 in the seed folder and every build already imported;
 *   - a versionCode already imported is skipped, loudly: a rebuilt APK must raise versionCode;
 *   - a versionCode lower than the current build is skipped, so the current never moves back.
 */

export const SIGNER_FILE = "SIGNER.sha256";

export interface SeedOutcome {
  file: string;
  result: "imported" | "already-imported" | "skipped" | "refused";
  reason?: string;
  versionName?: string;
  versionCode?: number;
}

const short = (hash: string) => `${hash.slice(0, 8)}…${hash.slice(-4)}`;

async function readExpectedSigner(seedDir: string): Promise<string | null> {
  try {
    const text = await readFile(path.join(seedDir, SIGNER_FILE), "utf8");
    const match = text.match(/\b[0-9a-fA-F]{64}\b/);
    if (!match) throw new Error(`${SIGNER_FILE} holds no SHA-256`);
    return match[0].toLowerCase();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/** Copy to a temp name, check the hash, then rename, so the store never holds a partial file. */
async function storeFile(source: string, sha256: string, storeDir: string): Promise<void> {
  await mkdir(storeDir, { recursive: true });
  const target = appBuildFilePath({ sha256 }, storeDir);
  const temp = `${target}.partial`;
  await copyFile(source, temp);
  if ((await fileSha256(temp)) !== sha256) {
    await unlink(temp);
    throw new Error("copied file does not match its SHA-256");
  }
  await rename(temp, target);
}

async function seedOne(
  file: string,
  source: string,
  expectedSigner: string | null,
  storeDir: string
): Promise<SeedOutcome> {
  let info: ApkInfo;
  try {
    info = await inspectApk(source);
  } catch (err) {
    return { file, result: "refused", reason: `not a readable signed APK: ${(err as Error).message}` };
  }
  const version = { versionName: info.versionName, versionCode: info.versionCode };

  if (info.packageName !== config.appBuilds.packageName) {
    return { file, ...version, result: "refused", reason: `package is ${info.packageName}` };
  }
  if (expectedSigner && info.signerSha256 !== expectedSigner) {
    return {
      file,
      ...version,
      result: "refused",
      reason: `signed by ${short(info.signerSha256)}, ${SIGNER_FILE} expects ${short(expectedSigner)}`,
    };
  }
  const anyBuild = await findAnyAppBuild();
  if (anyBuild && anyBuild.signerSha256 !== info.signerSha256) {
    return {
      file,
      ...version,
      result: "refused",
      reason: `signed by ${short(info.signerSha256)}, imported builds are signed by ${short(anyBuild.signerSha256)}`,
    };
  }

  const existing = await findAppBuildBySha256(info.sha256);
  if (existing) {
    if (!(await fileExists(appBuildFilePath(existing, storeDir)))) {
      await storeFile(source, info.sha256, storeDir);
      return { file, ...version, result: "already-imported", reason: "stored file was missing; restored" };
    }
    return { file, ...version, result: "already-imported" };
  }
  const sameCode = await findAppBuildByVersionCode(info.versionCode);
  if (sameCode) {
    return {
      file,
      ...version,
      result: "skipped",
      reason: `versionCode ${info.versionCode} was already imported from ${sameCode.sourceName} with different contents; a new build must raise versionCode`,
    };
  }
  const current = await refreshCurrentAppBuild();
  if (current && info.versionCode < current.versionCode) {
    return {
      file,
      ...version,
      result: "skipped",
      reason: `versionCode ${info.versionCode} is lower than the current build (${current.versionCode}); the current build never moves back`,
    };
  }

  await storeFile(source, info.sha256, storeDir);
  await insertAppBuild({
    sha256: info.sha256,
    packageName: info.packageName,
    versionCode: info.versionCode,
    versionName: info.versionName,
    signerSha256: info.signerSha256,
    size: info.size,
    sourceName: file,
  });
  return { file, ...version, result: "imported" };
}

export async function seedAppBuilds(
  seedDir = config.appBuilds.seedDir,
  storeDir = config.appBuilds.storeDir
): Promise<{ outcomes: SeedOutcome[]; current: AppBuild | null }> {
  let files: string[];
  try {
    files = (await readdir(seedDir)).filter((f) => f.toLowerCase().endsWith(".apk")).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    files = [];
  }

  const outcomes: SeedOutcome[] = [];
  if (files.length > 0) {
    const expectedSigner = await readExpectedSigner(seedDir);
    if (!expectedSigner) {
      console.warn(`App builds: no ${SIGNER_FILE} in ${seedDir}; only the stored builds' signer is enforced`);
    }
    for (const file of files) {
      const outcome = await seedOne(file, path.join(seedDir, file), expectedSigner, storeDir);
      outcomes.push(outcome);
      const what = outcome.versionName ? ` (${outcome.versionName}, versionCode ${outcome.versionCode})` : "";
      const why = outcome.reason ? `: ${outcome.reason}` : "";
      const line = `App builds: ${outcome.result} ${file}${what}${why}`;
      if (outcome.result === "refused" || outcome.result === "skipped") console.warn(line);
      else console.log(line);
    }
  }

  const current = await refreshCurrentAppBuild();
  console.log(
    current
      ? `App builds: current ${current.versionName} (versionCode ${current.versionCode}, sha256 ${short(current.sha256)})`
      : `App builds: none imported (no APK in ${seedDir}); devices get no update offer`
  );
  return { outcomes, current };
}
