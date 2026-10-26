import path from "node:path";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { compareSemver, parseSemver } from "./semver.js";

/** App APKs the console hosts. The current build is the one with the highest versionCode. */

export const APP_DOWNLOAD_PATH = "/api/v1/app/apk";

export interface AppBuild {
  sha256: string;
  packageName: string;
  versionCode: number;
  versionName: string;
  signerSha256: string;
  size: number;
  sourceName: string;
  createdAt: Date;
}

/** What a device is told when the console has a newer app than the one it reports. */
export interface AppUpdateOffer {
  versionCode: number;
  versionName: string;
  url: string;
  sha256: string;
  size: number;
}

interface AppBuildRow {
  sha256: string;
  package_name: string;
  version_code: number;
  version_name: string;
  signer_sha256: string;
  size: string;
  source_name: string;
  created_at: Date;
}

function toAppBuild(row: AppBuildRow): AppBuild {
  return {
    sha256: row.sha256,
    packageName: row.package_name,
    versionCode: row.version_code,
    versionName: row.version_name,
    signerSha256: row.signer_sha256,
    size: Number(row.size),
    sourceName: row.source_name,
    createdAt: row.created_at,
  };
}

async function selectOne(where: string, params: unknown[]): Promise<AppBuild | null> {
  const result = await pool.query<AppBuildRow>(`SELECT * FROM app_builds ${where} LIMIT 1`, params);
  return result.rows[0] ? toAppBuild(result.rows[0]) : null;
}

export const findAppBuildBySha256 = (sha256: string) => selectOne("WHERE sha256 = $1", [sha256]);
export const findAppBuildByVersionCode = (versionCode: number) =>
  selectOne("WHERE version_code = $1", [versionCode]);
export const findAnyAppBuild = () => selectOne("", []);
const selectCurrent = () => selectOne("ORDER BY version_code DESC", []);

export async function insertAppBuild(build: Omit<AppBuild, "createdAt">): Promise<void> {
  await pool.query(
    `INSERT INTO app_builds (sha256, package_name, version_code, version_name, signer_sha256, size, source_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      build.sha256,
      build.packageName,
      build.versionCode,
      build.versionName,
      build.signerSha256,
      build.size,
      build.sourceName,
    ]
  );
}

// Only the startup import changes the builds, so the current one is cached between imports.
let currentBuild: AppBuild | null = null;

export async function refreshCurrentAppBuild(): Promise<AppBuild | null> {
  currentBuild = await selectCurrent();
  return currentBuild;
}

export function getCurrentAppBuild(): AppBuild | null {
  return currentBuild;
}

export function appBuildFilePath(build: Pick<AppBuild, "sha256">, storeDir = config.appBuilds.storeDir): string {
  return path.join(storeDir, `${build.sha256}.apk`);
}

export function appDownloadUrl(): string {
  return `${config.publicBaseUrl.replace(/\/+$/, "")}${APP_DOWNLOAD_PATH}`;
}

export function appDownloadFilename(build: Pick<AppBuild, "versionName">): string {
  return `eud-remote-assist-${build.versionName}.apk`;
}

/**
 * An offer when the console's build is newer than the device's reported version (versionName,
 * semver). An unknown or unparseable device version also gets the offer; the app compares
 * versionCode itself before showing anything.
 */
export function appUpdateOffer(
  build: AppBuild | null,
  deviceAppVersion: string | null | undefined
): AppUpdateOffer | null {
  if (!build) return null;
  const offered = parseSemver(build.versionName);
  const installed = parseSemver(deviceAppVersion);
  if (offered && installed && compareSemver(offered, installed) <= 0) return null;
  return {
    versionCode: build.versionCode,
    versionName: build.versionName,
    url: appDownloadUrl(),
    sha256: build.sha256,
    size: build.size,
  };
}
