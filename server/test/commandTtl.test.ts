import { describe, expect, it } from "vitest";
import { COMMAND_TTL_MS, commandTtlMs, isCommandFresh } from "../src/services/commands.js";

const NOW = new Date("2026-10-25T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MIN = 60_000;

describe("queued command TTL (D7)", () => {
  it("has the owner-approved TTLs for remote view and lock", () => {
    expect(COMMAND_TTL_MS.START_REMOTE_ADMIN).toBe(2 * MIN);
    expect(COMMAND_TTL_MS.LOCK_DEVICE).toBe(24 * 60 * MIN);
  });

  it("keeps an unlock PIN deliverable only briefly", () => {
    expect(COMMAND_TTL_MS.REMOTE_UNLOCK).toBeLessThanOrEqual(2 * MIN);
  });

  it("is fresh strictly before its TTL and stale at it", () => {
    expect(isCommandFresh("START_REMOTE_ADMIN", ago(2 * MIN - 1), NOW)).toBe(true);
    expect(isCommandFresh("START_REMOTE_ADMIN", ago(2 * MIN), NOW)).toBe(false);
    expect(isCommandFresh("LOCK_DEVICE", ago(23 * 60 * MIN), NOW)).toBe(true);
    expect(isCommandFresh("LOCK_DEVICE", ago(25 * 60 * MIN), NOW)).toBe(false);
  });

  it("gives commands it doesn't know the longest TTL", () => {
    expect(commandTtlMs("SOMETHING_OLD")).toBe(Math.max(...Object.values(COMMAND_TTL_MS)));
  });
});
