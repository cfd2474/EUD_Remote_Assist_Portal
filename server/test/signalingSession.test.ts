import { afterEach, describe, expect, it, vi } from "vitest";
import {
  drainPendingToDevice,
  getSignalingReplay,
  getSignalingStatus,
  pruneIdleSessions,
  recordAdminToDevice,
  setRemoteSessionActive,
  signalingSessionCount,
} from "../src/services/signalingSession.js";

const HOUR = 60 * 60_000;

afterEach(() => {
  vi.useRealTimers();
  pruneIdleSessions(new Date(Date.now() + 1000 * HOUR)); // clear everything between tests
});

describe("signaling session readers", () => {
  it("don't create a session for an unknown uid", () => {
    const before = signalingSessionCount();
    expect(getSignalingStatus("never-seen").remoteActive).toBe(false);
    expect(getSignalingReplay("never-seen")).toEqual([]);
    expect(drainPendingToDevice("never-seen")).toEqual([]);
    expect(signalingSessionCount()).toBe(before);
  });
});

describe("pruneIdleSessions", () => {
  it("forgets an inactive session after 1 h without activity", () => {
    const start = new Date("2026-10-25T12:00:00Z");
    vi.useFakeTimers({ now: start });
    recordAdminToDevice("idle", { type: "webrtc", ice: { candidate: "c" } }, "websocket");

    expect(pruneIdleSessions(new Date(start.getTime() + HOUR - 1))).toBe(0);
    expect(pruneIdleSessions(new Date(start.getTime() + HOUR + 1))).toBe(1);
    expect(getSignalingStatus("idle").adminIceCount).toBe(0);
  });

  it("keeps a session marked remote-active for up to 24 h", () => {
    const start = new Date("2026-10-25T12:00:00Z");
    vi.useFakeTimers({ now: start });
    setRemoteSessionActive("active", true);

    expect(pruneIdleSessions(new Date(start.getTime() + 2 * HOUR))).toBe(0);
    expect(getSignalingStatus("active").remoteActive).toBe(true);
    expect(pruneIdleSessions(new Date(start.getTime() + 25 * HOUR))).toBe(1);
  });
});
