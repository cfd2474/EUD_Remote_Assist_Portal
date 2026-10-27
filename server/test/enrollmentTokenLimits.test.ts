import { describe, expect, it } from "vitest";
import { enrollmentTokenLimits } from "../src/services/enrollmentTokens.js";

const NOW = new Date("2026-10-25T12:00:00Z");
const plus = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

describe("enrollmentTokenLimits", () => {
  it.each([
    ["single_use", { maxUses: 1, expiresAt: null }],
    ["10_min", { maxUses: null, expiresAt: plus(10) }],
    ["1_hour", { maxUses: null, expiresAt: plus(60) }],
    ["8_hours", { maxUses: null, expiresAt: plus(480) }],
    ["24_hours", { maxUses: null, expiresAt: plus(1440) }],
    ["no_expiration", { maxUses: null, expiresAt: null }],
    ["something-else", { maxUses: null, expiresAt: null }],
  ])("QR %s", (duration, expected) => {
    expect(enrollmentTokenLimits("qr", duration, NOW)).toEqual(expected);
  });

  it("never limits MDM tokens, whatever duration is sent", () => {
    expect(enrollmentTokenLimits("mdm", "single_use", NOW)).toEqual({ maxUses: null, expiresAt: null });
  });

  it("ignores a non-string duration", () => {
    expect(enrollmentTokenLimits("qr", 10, NOW)).toEqual({ maxUses: null, expiresAt: null });
  });
});
