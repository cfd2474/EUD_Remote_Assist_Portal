/** The hub reports admin viewer counts per device as admin sockets register and close. */
import { WebSocket } from "ws";
import { describe, expect, it } from "vitest";
import { ConnectionHub } from "../src/ws/hub.js";

/** Just enough of a ws.WebSocket for the hub's admin paths. */
function fakeSocket(): WebSocket {
  return { readyState: WebSocket.OPEN, send: () => {}, close: () => {} } as unknown as WebSocket;
}

describe("ConnectionHub viewer counts", () => {
  it("counts viewers per device and notifies on every change", () => {
    const hub = new ConnectionHub();
    const events: Array<[string, number]> = [];
    hub.onViewerCountChange((uid, n) => events.push([uid, n]));

    const a = fakeSocket();
    const b = fakeSocket();
    hub.registerAdmin(a, "s1", "dev");
    hub.registerAdmin(b, "s2", "dev");
    expect(hub.viewerCount("dev")).toBe(2);

    hub.unregister(a);
    hub.unregister(b);
    expect(hub.viewerCount("dev")).toBe(0);
    expect(events).toEqual([
      ["dev", 1],
      ["dev", 2],
      ["dev", 1],
      ["dev", 0],
    ]);
  });

  it("does not notify twice when the same socket is unregistered again (close + error)", () => {
    const hub = new ConnectionHub();
    const events: number[] = [];
    hub.onViewerCountChange((_uid, n) => events.push(n));
    const a = fakeSocket();
    hub.registerAdmin(a, "s1", "dev");
    hub.unregister(a);
    hub.unregister(a);
    expect(events).toEqual([1, 0]);
  });
});
