/**
 * Admin API network settings, end to end through Express and real admin JWTs.
 * Scenario: TURN comes from the environment, address lookup is off, and a Server Port
 * (retired in 3.2.0) was saved in Portal Configuration before the upgrade.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestIssuer } from "./helpers/testIssuer.js";

const TURN = "turn:203.0.113.10:3479";
const GOOGLE = "stun:stun.l.google.com:19302";
const EXPECTED_ICE = [{ urls: [GOOGLE] }, { urls: [TURN], username: "ra-user", credential: "ra-secret" }];

const issuer = new TestIssuer();
let server: http.Server;
let base = "";
let token = "";

beforeAll(async () => {
  await issuer.start();
  const settingsDir = mkdtempSync(join(tmpdir(), "eud-settings-"));
  writeFileSync(join(settingsDir, "portal-settings.json"), JSON.stringify({ serverPort: 8449 }));

  Object.assign(process.env, {
    OIDC_JWKS_URI: issuer.jwksUri,
    PUBLIC_BASE_URL: "https://remote.example.test:8448/",
    TURN_URL: TURN,
    TURN_USERNAME: "ra-user",
    TURN_CREDENTIAL: "ra-secret",
    GEOCODER_URL: "none",
    PORTAL_SETTINGS_DIR: settingsDir,
  });

  const { adminApiRouter } = await import("../src/routes/adminApi.js");
  const { loadPortalSettings } = await import("../src/services/portalSettings.js");
  await loadPortalSettings();

  const app = express();
  app.use(express.json());
  app.use("/api/admin", adminApiRouter);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin`;
  token = await issuer.adminToken();
});

afterAll(() => {
  server?.close();
  issuer.stop();
});

function api(path: string, init: RequestInit = {}, bearer: string | null = token) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  return fetch(`${base}${path}`, { ...init, headers });
}

describe("GET /client-config", () => {
  it("requires an admin token", async () => {
    expect((await api("/client-config", {}, null)).status).toBe(401);
  });

  it("gives the browser the device API URL, the ICE list, map tiles and geocoder state", async () => {
    const res = await api("/client-config");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      publicBaseUrl: "https://remote.example.test:8448/",
      iceServers: EXPECTED_ICE,
      mapTiles: {
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
      geocoderEnabled: false,
    });
  });
});

describe("Portal Configuration", () => {
  it("reports TURN as environment-managed and flags the stale Server Port", async () => {
    const status = await (await api("/portal-config")).json();
    expect(status).toMatchObject({
      turnSource: "environment",
      turnServerUrl: TURN,
      turnCredentialConfigured: true,
      publicBaseUrl: "https://remote.example.test:8448/",
      devicePort: 8448,
      legacyServerPort: 8449,
      serverPortMismatch: true,
    });
    expect(JSON.stringify(status)).not.toContain("ra-secret");
  });

  it("refuses to change or remove an environment-managed TURN server (409)", async () => {
    const put = await api("/portal-config/turn", {
      method: "PUT",
      body: JSON.stringify({ turnServerUrl: "turn:other.test:3478" }),
    });
    expect(put.status).toBe(409);
    expect((await api("/portal-config/turn", { method: "DELETE" })).status).toBe(409);
  });

  it("has retired the Server Port setting (410)", async () => {
    const res = await api("/portal-config/server-port", { method: "PUT", body: JSON.stringify({ port: 9000 }) });
    expect(res.status).toBe(410);
  });
});

describe("GET /geocode/reverse", () => {
  it("answers 404 without calling out when address lookup is off", async () => {
    const res = await api("/geocode/reverse?lat=33.1&lon=-117.2");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ disabled: true });
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("START_REMOTE_ADMIN device payload (Postgres)", () => {
  it("queues the same ICE list the browser gets, with urls as arrays", async () => {
    const { pool } = await import("../src/db/pool.js");
    const { applyMigrations } = await import("../src/db/schema.js");
    const { drainCommands } = await import("../src/services/commands.js");
    await applyMigrations(pool);
    await pool.query("DELETE FROM devices WHERE uid = 'net-test-device'");
    await pool.query(
      "INSERT INTO devices (uid, device_name, connection_secret) VALUES ('net-test-device', 'Net test', 'x')"
    );

    const res = await api("/devices/net-test-device/command", {
      method: "POST",
      body: JSON.stringify({ command: "START_REMOTE_ADMIN" }),
    });
    expect(await res.json()).toMatchObject({ ok: true, delivery: "queued", expiresInSeconds: 120 });

    const [delivered] = await drainCommands("net-test-device");
    expect(delivered).toEqual({ type: "command", command: "START_REMOTE_ADMIN", iceServers: EXPECTED_ICE });

    await pool.query("DELETE FROM devices WHERE uid = 'net-test-device'");
    await pool.end();
  });
});
