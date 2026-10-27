import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startViewerPresencePolicy } from "../src/services/viewerPresence.js";

const GRACE = 15_000;

function harness(remoteActive = true) {
  let listener: (uid: string, viewers: number) => void = () => {};
  const viewers = new Map<string, number>();
  const active = new Map<string, boolean>();
  const stopSession = vi.fn(async (_uid: string) => "queued");
  const policy = startViewerPresencePolicy({
    onViewerCountChange: (l) => {
      listener = l;
    },
    viewerCount: (uid) => viewers.get(uid) ?? 0,
    isRemoteActive: (uid) => active.get(uid) ?? remoteActive,
    stopSession,
    graceMs: GRACE,
  });
  const setViewers = (uid: string, n: number) => {
    viewers.set(uid, n);
    listener(uid, n);
  };
  return { policy, setViewers, stopSession, active };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("viewer presence (D8: last viewer stops the session)", () => {
  it("does nothing while at least one viewer remains", () => {
    const h = harness();
    h.setViewers("dev", 2);
    h.setViewers("dev", 1);
    vi.advanceTimersByTime(GRACE * 2);
    expect(h.stopSession).not.toHaveBeenCalled();
  });

  it("stops the session once the last viewer has been gone for the grace period", () => {
    const h = harness();
    h.setViewers("dev", 1);
    h.setViewers("dev", 0);
    vi.advanceTimersByTime(GRACE - 1);
    expect(h.stopSession).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(h.stopSession).toHaveBeenCalledExactlyOnceWith("dev");
  });

  it("keeps the session when a viewer returns within the grace (reload, reconnect)", () => {
    const h = harness();
    h.setViewers("dev", 0);
    vi.advanceTimersByTime(GRACE / 2);
    h.setViewers("dev", 1);
    vi.advanceTimersByTime(GRACE * 2);
    expect(h.stopSession).not.toHaveBeenCalled();
    expect(h.policy.pending()).toEqual([]);
  });

  it("ignores devices that are not in a remote session", () => {
    const h = harness(false);
    h.setViewers("dev", 0);
    vi.advanceTimersByTime(GRACE * 2);
    expect(h.stopSession).not.toHaveBeenCalled();
  });

  it("does not stop a session that already ended during the grace", () => {
    const h = harness();
    h.setViewers("dev", 0);
    h.active.set("dev", false); // e.g. an explicit Disconnect arrived meanwhile
    vi.advanceTimersByTime(GRACE);
    expect(h.stopSession).not.toHaveBeenCalled();
  });

  it("tracks devices independently", () => {
    const h = harness();
    h.setViewers("a", 0);
    h.setViewers("b", 1);
    vi.advanceTimersByTime(GRACE);
    expect(h.stopSession).toHaveBeenCalledExactlyOnceWith("a");
  });
});
