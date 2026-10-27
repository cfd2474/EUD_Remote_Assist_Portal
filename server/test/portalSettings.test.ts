/**
 * TURN managed from Portal Configuration (no TURN_URL in the environment): validation,
 * persistence, and that the saved server joins the shared ICE list.
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const settingsDir = mkdtempSync(join(tmpdir(), "eud-settings-"));
let settings: typeof import("../src/services/portalSettings.js");

beforeAll(async () => {
  delete process.env.TURN_URL;
  process.env.PORTAL_SETTINGS_DIR = settingsDir;
  process.env.PUBLIC_BASE_URL = "https://remote.example.test";
  settings = await import("../src/services/portalSettings.js");
  await settings.loadPortalSettings();
});

describe("portal-managed TURN", () => {
  it("starts with no TURN and STUN only", () => {
    expect(settings.getEffectiveTurn()).toEqual({ source: null });
    expect(settings.getIceServers()).toEqual([{ urls: ["stun:stun.l.google.com:19302"] }]);
  });

  it("rejects a URL that is not turn:/turns:", async () => {
    await expect(settings.setTurnSettings("stun:host:3478")).rejects.toThrow(/turn: or turns:/);
    await expect(settings.setTurnSettings("   ")).rejects.toThrow(/required/);
  });

  it("saves a TURN server to the settings file and adds it to the ICE list", async () => {
    await settings.setTurnSettings(" turn:203.0.113.10:3479 ", " u ", "p");

    const saved = JSON.parse(readFileSync(join(settingsDir, "portal-settings.json"), "utf8"));
    expect(saved).toMatchObject({ turnServerUrl: "turn:203.0.113.10:3479", turnUsername: "u", turnCredential: "p" });
    expect(settings.getPortalConfigStatus()).toMatchObject({ turnSource: "portal", turnCredentialConfigured: true });
    expect(settings.getIceServers()).toEqual([
      { urls: ["stun:stun.l.google.com:19302"] },
      { urls: ["turn:203.0.113.10:3479"], username: "u", credential: "p" },
    ]);
  });

  it("removes it again", async () => {
    await settings.clearTurnSettings();
    expect(settings.getPortalConfigStatus().turnSource).toBeNull();
    expect(settings.getIceServers()).toHaveLength(1);
  });

  it("derives the device port from PUBLIC_BASE_URL (scheme default when omitted)", () => {
    expect(settings.getPortalConfigStatus()).toMatchObject({
      devicePort: 443,
      legacyServerPort: null,
      serverPortMismatch: false,
    });
  });
});
