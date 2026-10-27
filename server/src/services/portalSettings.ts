import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { buildIceServers, isValidTurnUrl, type IceServer, type TurnServer } from "./iceServers.js";

/** Thrown when the UI tries to change a setting that .env controls. */
export class EnvManagedSettingError extends Error {}

const SETTINGS_DIR =
  process.env.PORTAL_SETTINGS_DIR ?? path.join(process.cwd(), "data");
const SETTINGS_PATH =
  process.env.PORTAL_SETTINGS_PATH ??
  path.join(SETTINGS_DIR, "portal-settings.json");

type PortalSettingsFile = {
  /** Retired in 3.3.0 (the console hosts the APK); dropped from the file on load. */
  githubToken?: string;
  serverPort?: number;
  turnServerUrl?: string;
  turnUsername?: string;
  turnCredential?: string;
};

let portalServerPort: number | undefined;
let portalTurnServerUrl: string | undefined;
let portalTurnUsername: string | undefined;
let portalTurnCredential: string | undefined;

export type SettingSource = "environment" | "portal" | null;

export type PortalConfigStatus = {
  /** Device API base URL from PUBLIC_BASE_URL; the enrollment QR uses it. */
  publicBaseUrl: string;
  /** Port in publicBaseUrl (default for the scheme when omitted), or null if unset/invalid. */
  devicePort: number | null;
  /** Retired "Server Port" setting, if one was saved before 3.2.0. Read-only. */
  legacyServerPort: number | null;
  /** True when a saved legacy Server Port differs from the port in PUBLIC_BASE_URL. */
  serverPortMismatch: boolean;
  turnServerUrl: string;
  turnCredentialConfigured: boolean;
  turnSource: SettingSource;
};

function portOf(baseUrl: string): number | null {
  try {
    const url = new URL(baseUrl);
    if (url.port) return Number(url.port);
    return url.protocol === "https:" ? 443 : url.protocol === "http:" ? 80 : null;
  } catch {
    return null;
  }
}

function envTurn(): TurnServer | undefined {
  const { url, username, credential } = config.webrtc.turn;
  return url ? { url, username, credential } : undefined;
}

/** TURN from .env wins over Portal Configuration. */
export function getEffectiveTurn(): { turn?: TurnServer; source: SettingSource } {
  const fromEnv = envTurn();
  if (fromEnv) return { turn: fromEnv, source: "environment" };
  if (portalTurnServerUrl) {
    return {
      turn: { url: portalTurnServerUrl, username: portalTurnUsername, credential: portalTurnCredential },
      source: "portal",
    };
  }
  return { source: null };
}

const reportedInvalidIceUrls = new Set<string>();

/** The ICE list for both the admin browser and the device. */
export function getIceServers(): IceServer[] {
  return buildIceServers(config.webrtc.stunUrls, getEffectiveTurn().turn, (url) => {
    if (reportedInvalidIceUrls.has(url)) return;
    reportedInvalidIceUrls.add(url);
    console.error(`Ignoring invalid ICE server URL (expected stun:/stuns: or turn:/turns:): ${url}`);
  });
}

export function getPortalConfigStatus(): PortalConfigStatus {
  const devicePort = portOf(config.publicBaseUrl);
  const legacyServerPort = portalServerPort ?? null;
  const { turn, source: turnSource } = getEffectiveTurn();

  return {
    publicBaseUrl: config.publicBaseUrl,
    devicePort,
    legacyServerPort,
    serverPortMismatch: legacyServerPort !== null && legacyServerPort !== devicePort,
    turnServerUrl: turn?.url ?? "",
    turnCredentialConfigured: !!turn?.credential,
    turnSource,
  };
}

export async function loadPortalSettings(): Promise<void> {
  try {
    const raw = await readFile(SETTINGS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as PortalSettingsFile;
    portalServerPort = parsed.serverPort;
    portalTurnServerUrl = parsed.turnServerUrl?.trim() || undefined;
    portalTurnUsername = parsed.turnUsername?.trim() || undefined;
    portalTurnCredential = parsed.turnCredential || undefined;
    if (parsed.githubToken) {
      // Don't leave a credential on disk that nothing uses any more.
      await persistPortalSettings();
      console.log("Removed the retired GitHub token from portal settings (the console now hosts the APK).");
    }

    // L-5: Enforce 0600 permissions on startup in case it was created manually
    try {
      await chmod(SETTINGS_PATH, 0o600);
    } catch {
      // Best effort
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.error("Failed to load portal settings:", err);
    }
    portalServerPort = undefined;
    portalTurnServerUrl = undefined;
    portalTurnUsername = undefined;
    portalTurnCredential = undefined;
  }
}

async function persistPortalSettings(): Promise<void> {
  await mkdir(SETTINGS_DIR, { recursive: true });

  const payload: PortalSettingsFile = {};
  if (portalServerPort !== undefined) {
    payload.serverPort = portalServerPort;
  }
  if (portalTurnServerUrl) {
    payload.turnServerUrl = portalTurnServerUrl;
  }
  if (portalTurnUsername !== undefined) {
    payload.turnUsername = portalTurnUsername;
  }
  if (portalTurnCredential !== undefined) {
    payload.turnCredential = portalTurnCredential;
  }

  await writeFile(SETTINGS_PATH, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });

  try {
    await chmod(SETTINGS_PATH, 0o600);
  } catch {
    // Best effort on platforms that restrict chmod.
  }
}

function assertTurnNotEnvManaged(): void {
  if (envTurn()) {
    throw new EnvManagedSettingError(
      "TURN is configured in the server environment (TURN_URL in .env). Change it there, or remove TURN_URL to manage it here."
    );
  }
}

export async function setTurnSettings(
  url: string,
  username?: string,
  credential?: string
): Promise<void> {
  assertTurnNotEnvManaged();
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    throw new Error("TURN Server URL is required.");
  }
  if (!isValidTurnUrl(trimmedUrl)) {
    throw new Error("TURN Server URL must start with turn: or turns: (for example turn:203.0.113.10:3479).");
  }
  portalTurnServerUrl = trimmedUrl;
  portalTurnUsername = username?.trim();
  portalTurnCredential = credential;
  await persistPortalSettings();
}

export async function clearTurnSettings(): Promise<void> {
  assertTurnNotEnvManaged();
  portalTurnServerUrl = undefined;
  portalTurnUsername = undefined;
  portalTurnCredential = undefined;
  await persistPortalSettings();
}
