import path from "node:path";

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Optional setting with a default. Compose passes unset variables as "", so empty means
 * "use the default"; the literal "none" (any case) turns the feature off and yields "".
 */
function settingEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  return value.toLowerCase() === "none" ? "" : value;
}

/** Comma- or space-separated list with the same empty/"none" rules as settingEnv. */
function listEnv(name: string, fallback: string[]): string[] {
  const value = settingEnv(name, fallback.join(","));
  return value.split(/[\s,]+/).filter(Boolean);
}

export const config = {
  port: parseInt(process.env.PORT ?? "3000", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: requireEnv("DATABASE_URL"),
  oidc: {
    issuer: requireEnv("OIDC_ISSUER"),
    audience: requireEnv("OIDC_AUDIENCE"),
    jwksUri:
      process.env.OIDC_JWKS_URI ||
      `${requireEnv("OIDC_ISSUER").replace(/\/$/, "")}/.well-known/jwks`,
    adminGroup: process.env.OIDC_ADMIN_GROUP || undefined,
    adminEmails: process.env.OIDC_ADMIN_EMAILS
      ? process.env.OIDC_ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase())
      : undefined,
  },
  /** Device API base URL (enrollment QR, register response). Required in compose. */
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? "").trim(),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  commandSecretHeader: "x-connection-secret",
  appBuilds: {
    /** Read-only folder with the release APK and SIGNER.sha256; compose mounts ./dist here. */
    seedDir: process.env.APP_SEED_DIR?.trim() || "/seed",
    /** Imported APKs, one file per SHA-256, under the persistent settings folder. */
    storeDir: path.join(process.env.PORTAL_SETTINGS_DIR ?? path.join(process.cwd(), "data"), "apk"),
    packageName: "com.cfd2474.eudremoteassist",
  },
  phonedb: {
    /** PHONEDB_ENABLED=false skips phonedb.net and shows only built-in model names. */
    enabled: process.env.PHONEDB_ENABLED?.trim().toLowerCase() !== "false",
    /** Only for a PhoneDB TLS chain that will not verify; off by default. */
    tlsInsecure: process.env.PHONEDB_TLS_INSECURE === "true",
  },
  webrtc: {
    /** STUN for browser and device. Default: Google public STUN; "none" sends no STUN. */
    stunUrls: listEnv("STUN_URLS", ["stun:stun.l.google.com:19302"]),
    /** TURN from the environment. When set, it overrides Portal Configuration. */
    turn: {
      url: (process.env.TURN_URL ?? "").trim(),
      username: process.env.TURN_USERNAME?.trim() || undefined,
      credential: process.env.TURN_CREDENTIAL || undefined,
    },
  },
  mapTiles: {
    /** Leaflet URL template for the admin maps; "none" shows maps without a basemap. */
    url: settingEnv("MAP_TILE_URL", "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"),
    attribution: settingEnv(
      "MAP_TILE_ATTRIBUTION",
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    ),
  },
  geocoder: {
    /** Nominatim-compatible /reverse endpoint; "none" turns address lookup off. */
    url: settingEnv("GEOCODER_URL", "https://nominatim.openstreetmap.org/reverse"),
    /** Nominatim policy requires an identifying User-Agent; derived from PUBLIC_BASE_URL if unset. */
    userAgent: process.env.GEOCODER_USER_AGENT?.trim() || undefined,
  },
};
