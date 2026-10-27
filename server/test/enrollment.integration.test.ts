/**
 * Enrollment-token rules against a real Postgres (row locks and transactions can't be mocked).
 * Runs only when TEST_DATABASE_URL is set; it TRUNCATES tables, so the database name must
 * contain "test". Local: see PROJECT_STATE.md operational notes. CI: a postgres service.
 */
import bcrypt from "bcrypt";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (TEST_DATABASE_URL && !/test/i.test(new URL(TEST_DATABASE_URL).pathname)) {
  throw new Error("TEST_DATABASE_URL must point at a database whose name contains 'test'");
}

describe.skipIf(!TEST_DATABASE_URL)("registerDevice enrollment rules (Postgres)", () => {
  let pool: typeof import("../src/db/pool.js").pool;
  let registerDevice: typeof import("../src/services/devices.js").registerDevice;

  beforeAll(async () => {
    ({ pool } = await import("../src/db/pool.js"));
    ({ registerDevice } = await import("../src/services/devices.js"));
    const { applyMigrations } = await import("../src/db/schema.js");
    await applyMigrations(pool);
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE devices, enrollment_tokens CASCADE");
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function makeToken(token: string, maxUses: number | null, agency: string | null = "TEST-AGENCY") {
    await pool.query(
      "INSERT INTO enrollment_tokens (token, type, max_uses, description, agency) VALUES ($1, 'qr', $2, 'test', $3)",
      [token, maxUses, agency]
    );
  }

  async function tokenState(token: string) {
    const { rows } = await pool.query<{ uses: number; is_active: boolean }>(
      "SELECT uses, is_active FROM enrollment_tokens WHERE token = $1",
      [token]
    );
    return rows[0];
  }

  const enroll = (uid: string, token: string | undefined, secret?: string) =>
    registerDevice({ uid, device_name: `Test ${uid}`, enrollment_token: token }, secret);

  it("enrolls a new device, stores only a hash of its secret, and inherits the token agency", async () => {
    await makeToken("tok", 1);
    const result = await enroll("dev-1", "tok");

    expect(result.is_new).toBe(true);
    expect(result.device.agency).toBe("TEST-AGENCY");
    expect(result.device.connection_secret).not.toBe(result.connection_secret);
    expect(await bcrypt.compare(result.connection_secret, result.device.connection_secret)).toBe(true);
    expect(await tokenState("tok")).toEqual({ uses: 1, is_active: false });
  });

  it("refuses missing, unknown, spent, revoked and expired tokens", async () => {
    await makeToken("spent", 1);
    await enroll("dev-1", "spent");
    await makeToken("revoked", null);
    await pool.query("UPDATE enrollment_tokens SET is_active = FALSE WHERE token = 'revoked'");
    await makeToken("expired", null);
    await pool.query("UPDATE enrollment_tokens SET expires_at = NOW() - INTERVAL '1 minute' WHERE token = 'expired'");

    await expect(enroll("dev-2", undefined)).rejects.toThrow("Missing enrollment_token");
    for (const token of ["nope", "spent", "revoked", "expired"]) {
      await expect(enroll("dev-2", token), token).rejects.toThrow(/enrollment token/);
    }
  });

  it("does not use up the token when re-enrollment is refused (no secret / wrong secret)", async () => {
    await makeToken("first", 1);
    const first = await enroll("dev-1", "first");
    await makeToken("again", 1);

    await expect(enroll("dev-1", "again")).rejects.toThrow(/re-registration/);
    await expect(enroll("dev-1", "again", "wrong-secret")).rejects.toThrow(/re-registration/);
    expect(await tokenState("again")).toEqual({ uses: 0, is_active: true });

    const second = await enroll("dev-1", "again", first.connection_secret);
    expect(second.is_new).toBe(false);
    expect(second.connection_secret).not.toBe(first.connection_secret);
    expect(await tokenState("again")).toEqual({ uses: 1, is_active: false });
  });

  it("lets exactly max_uses of many concurrent registrations through", async () => {
    await makeToken("one", 1);
    await makeToken("three", 3);

    const one = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => enroll(`one-${i}`, "one")));
    const three = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => enroll(`three-${i}`, "three")));

    expect(one.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(three.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await tokenState("one")).toEqual({ uses: 1, is_active: false });
    expect(await tokenState("three")).toEqual({ uses: 3, is_active: false });

    const { rows } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM devices");
    expect(rows[0].n).toBe(4);
  });
});
