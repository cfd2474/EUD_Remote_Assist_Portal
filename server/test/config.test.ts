/**
 * Env parsing in config.ts. Compose passes unset variables as "", so "" must mean
 * "use the default" and the literal "none" must turn a feature off.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const KEYS = [
  "STUN_URLS", "TURN_URL", "TURN_USERNAME", "TURN_CREDENTIAL", "MAP_TILE_URL",
  "GEOCODER_URL", "PHONEDB_ENABLED", "OIDC_JWKS_URI", "PUBLIC_BASE_URL",
] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

async function loadConfig(env: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) {
    if (key in env) process.env[key] = env[key];
    else if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.resetModules();
  return (await import("../src/config.js")).config;
}

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("config", () => {
  it("uses today's behaviour when the new variables are empty (as compose passes them)", async () => {
    const config = await loadConfig({ STUN_URLS: "", TURN_URL: "", MAP_TILE_URL: "", GEOCODER_URL: "", PHONEDB_ENABLED: "" });
    expect(config.webrtc.stunUrls).toEqual(["stun:stun.l.google.com:19302"]);
    expect(config.webrtc.turn.url).toBe("");
    expect(config.mapTiles.url).toBe("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(config.geocoder.url).toBe("https://nominatim.openstreetmap.org/reverse");
    expect(config.phonedb.enabled).toBe(true);
  });

  it('turns services off with "none" (any case) and PHONEDB_ENABLED=false', async () => {
    const config = await loadConfig({ STUN_URLS: "none", MAP_TILE_URL: "NONE", GEOCODER_URL: " None ", PHONEDB_ENABLED: "False" });
    expect(config.webrtc.stunUrls).toEqual([]);
    expect(config.mapTiles.url).toBe("");
    expect(config.geocoder.url).toBe("");
    expect(config.phonedb.enabled).toBe(false);
  });

  it("splits STUN_URLS on commas and whitespace", async () => {
    const config = await loadConfig({ STUN_URLS: " stun:a.test:3478, stun:b.test:3478  stun:c.test:3478 " });
    expect(config.webrtc.stunUrls).toEqual(["stun:a.test:3478", "stun:b.test:3478", "stun:c.test:3478"]);
  });

  it("reads TURN from the environment", async () => {
    const config = await loadConfig({ TURN_URL: " turn:203.0.113.10:3479 ", TURN_USERNAME: "u", TURN_CREDENTIAL: "p" });
    expect(config.webrtc.turn).toEqual({ url: "turn:203.0.113.10:3479", username: "u", credential: "p" });
  });

  it("falls back to the issuer JWKS path when OIDC_JWKS_URI is empty (compose passes \"\")", async () => {
    const config = await loadConfig({ OIDC_JWKS_URI: "" });
    expect(config.oidc.jwksUri).toBe("https://issuer.test/application/o/eud-test/.well-known/jwks");
  });
});
