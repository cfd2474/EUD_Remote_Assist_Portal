import { describe, expect, it } from "vitest";
import { isAuthRejection, reconnectDelayMs } from "./reconnectDelay";

describe("reconnectDelayMs", () => {
  it("backs off 1, 2, 4, 8 s, then holds at 10 s", () => {
    expect([0, 1, 2, 3, 4, 10].map(reconnectDelayMs)).toEqual([1000, 2000, 4000, 8000, 10000, 10000]);
  });
});

describe("isAuthRejection", () => {
  it("treats only the server's auth-failure close code as final", () => {
    expect(isAuthRejection(4003)).toBe(true);
    expect(isAuthRejection(1006)).toBe(false);
    expect(isAuthRejection(1000)).toBe(false);
  });
});
