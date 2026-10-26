/**
 * Command dispatch against Postgres: queueing, TTL at delivery, the remote-admin flag, and
 * the daily purge. No device WebSocket is connected, so every send falls back to the queue.
 * Needs TEST_DATABASE_URL (database name must contain "test"); skipped otherwise.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (TEST_DATABASE_URL && !/test/i.test(new URL(TEST_DATABASE_URL).pathname)) {
  throw new Error("TEST_DATABASE_URL must point at a database whose name contains 'test'");
}

const UID = "dispatch-test-device";

describe.skipIf(!TEST_DATABASE_URL)("command dispatch (Postgres)", () => {
  let pool: typeof import("../src/db/pool.js").pool;
  let dispatch: typeof import("../src/services/commandDispatch.js");
  let commands: typeof import("../src/services/commands.js");
  let signaling: typeof import("../src/services/signalingSession.js");

  beforeAll(async () => {
    ({ pool } = await import("../src/db/pool.js"));
    dispatch = await import("../src/services/commandDispatch.js");
    commands = await import("../src/services/commands.js");
    signaling = await import("../src/services/signalingSession.js");
    const { applyMigrations } = await import("../src/db/schema.js");
    await applyMigrations(pool);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM devices WHERE uid = $1", [UID]);
    await pool.query(
      "INSERT INTO devices (uid, device_name, connection_secret) VALUES ($1, 'Dispatch test', 'x')",
      [UID]
    );
  });

  afterAll(async () => {
    await pool?.query("DELETE FROM devices WHERE uid = $1", [UID]);
    await pool?.end();
  });

  const remoteFlag = async () =>
    (await pool.query<{ remote_admin_active: boolean }>(
      "SELECT remote_admin_active FROM devices WHERE uid = $1",
      [UID]
    )).rows[0].remote_admin_active;

  const ageQueued = (command: string, ms: number) =>
    pool.query(
      "UPDATE pending_commands SET created_at = NOW() - ($3 * INTERVAL '1 millisecond') WHERE uid = $1 AND command = $2",
      [UID, command, ms]
    );

  it("a queued START doesn't mark the device remote-active until it is delivered", async () => {
    const ice = [{ urls: ["stun:stun.example.test:3478"] }];
    expect(await dispatch.dispatchCommand(UID, "START_REMOTE_ADMIN", { iceServers: ice })).toBe("queued");
    expect(await remoteFlag()).toBe(false);
    expect(signaling.getSignalingStatus(UID).remoteActive).toBe(true);

    const delivered = await dispatch.deliverQueuedCommands(UID);
    expect(delivered).toEqual([{ type: "command", command: "START_REMOTE_ADMIN", iceServers: ice }]);
    expect(await remoteFlag()).toBe(true);
  });

  it("a queued STOP ends the session at once", async () => {
    await pool.query("UPDATE devices SET remote_admin_active = TRUE WHERE uid = $1", [UID]);
    signaling.setRemoteSessionActive(UID, true);

    expect(await dispatch.dispatchCommand(UID, "STOP_REMOTE_ADMIN")).toBe("queued");
    expect(await remoteFlag()).toBe(false);
    expect(signaling.getSignalingStatus(UID).remoteActive).toBe(false);
  });

  it("drops commands past their TTL at delivery and keeps queue order for the rest", async () => {
    await dispatch.dispatchCommand(UID, "START_REMOTE_ADMIN");
    await dispatch.dispatchCommand(UID, "TRIGGER_PING");
    await dispatch.dispatchCommand(UID, "LOCK_DEVICE");
    await dispatch.dispatchCommand(UID, "REQUEST_LOCATION");
    await ageQueued("START_REMOTE_ADMIN", 3 * 60_000); // TTL 2 min: stale
    await ageQueued("LOCK_DEVICE", 3 * 60 * 60_000); //   TTL 24 h: fresh

    const delivered = await dispatch.deliverQueuedCommands(UID);
    expect(delivered.map((m) => m.command)).toEqual(["TRIGGER_PING", "LOCK_DEVICE", "REQUEST_LOCATION"]);
    expect(await remoteFlag()).toBe(false); // the stale START never took effect

    const left = await pool.query("SELECT count(*)::int AS n FROM pending_commands WHERE uid = $1", [UID]);
    expect(left.rows[0].n).toBe(0);
  });

  it("the daily purge removes only commands past their TTL", async () => {
    await dispatch.dispatchCommand(UID, "TRIGGER_PING");
    await dispatch.dispatchCommand(UID, "LOCK_DEVICE");
    await pool.query(
      "INSERT INTO pending_commands (uid, command, created_at) VALUES ($1, 'LEGACY_COMMAND', NOW() - INTERVAL '25 hours')",
      [UID]
    );
    await ageQueued("TRIGGER_PING", 11 * 60_000); // TTL 10 min: stale
    await ageQueued("LOCK_DEVICE", 60 * 60_000); //  TTL 24 h: fresh

    expect(await commands.purgeExpiredCommands()).toBeGreaterThanOrEqual(2);
    const left = await pool.query<{ command: string }>(
      "SELECT command FROM pending_commands WHERE uid = $1",
      [UID]
    );
    expect(left.rows.map((r) => r.command)).toEqual(["LOCK_DEVICE"]);
  });
});
