import { describe, expect, it } from "vitest";
import { queuedExpiryText } from "./queuedExpiry";

describe("queuedExpiryText", () => {
  it("formats the server's TTLs in operator terms", () => {
    expect(queuedExpiryText(120)).toBe("2 minutes");
    expect(queuedExpiryText(600)).toBe("10 minutes");
    expect(queuedExpiryText(3600)).toBe("1 hour");
    expect(queuedExpiryText(86400)).toBe("24 hours");
    expect(queuedExpiryText(45)).toBe("45 seconds");
  });

  it("falls back when the server didn't say", () => {
    expect(queuedExpiryText(undefined)).toBe("its expiry time");
  });
});
