/**
 * Before a device has authenticated: a keepalive ping is answered and the socket stays open
 * (it can race the auth message on a fresh connection); anything else that isn't auth closes it.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attachWebSocketHandlers } from "../src/ws/handlers.js";

let server: http.Server;
let url = "";

beforeAll(async () => {
  const wss = new WebSocketServer({ noServer: true });
  attachWebSocketHandlers(wss, "/ws/device");
  server = http.createServer();
  server.on("upgrade", (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws/device`;
});

afterAll(() => {
  server?.close();
});

function open(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

const nextMessage = (ws: WebSocket) =>
  new Promise<Record<string, unknown>>((resolve) => ws.once("message", (m) => resolve(JSON.parse(m.toString()))));
const closeCode = (ws: WebSocket) => new Promise<number>((resolve) => ws.once("close", (code) => resolve(code)));

describe.skipIf(!process.env.TEST_DATABASE_URL)("device WebSocket while auth is in progress (Postgres)", () => {
  const UID = "ws-auth-race-device";
  const SECRET = "race-secret-0123456789";

  it("holds messages sent right after auth until it completes, instead of closing with 4003", async () => {
    const bcrypt = (await import("bcrypt")).default;
    const { pool } = await import("../src/db/pool.js");
    const { applyMigrations } = await import("../src/db/schema.js");
    await applyMigrations(pool);
    await pool.query("DELETE FROM devices WHERE uid = $1", [UID]);
    await pool.query("INSERT INTO devices (uid, device_name, connection_secret) VALUES ($1, 'Race', $2)", [
      UID,
      await bcrypt.hash(SECRET, 10),
    ]);

    const ws = await open();
    const received: Record<string, unknown>[] = [];
    ws.on("message", (m) => received.push(JSON.parse(m.toString())));
    let closedWith: number | null = null;
    ws.on("close", (code) => (closedWith = code));

    // Sent back-to-back: the second message arrives while bcrypt is still checking the first.
    ws.send(JSON.stringify({ type: "auth", uid: UID, connection_secret: SECRET }));
    ws.send(JSON.stringify({ type: "webrtc_ready" }));
    ws.send(JSON.stringify({ type: "ping" }));

    await new Promise((r) => setTimeout(r, 1500));
    expect(closedWith).toBeNull();
    expect(received.map((m) => m.type)).toEqual(expect.arrayContaining(["auth_ok", "pong"]));
    expect(received[0]?.type).toBe("auth_ok");

    ws.close();
    await pool.query("DELETE FROM devices WHERE uid = $1", [UID]);
    await pool.end();
  });
});

describe("device WebSocket before auth", () => {
  it("answers a ping with pong and keeps the connection open", async () => {
    const ws = await open();
    const reply = nextMessage(ws);
    ws.send(JSON.stringify({ type: "ping" }));
    expect(await reply).toEqual({ type: "pong" });
    await new Promise((r) => setTimeout(r, 200));
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it("still closes with 4003 on any other message that isn't auth", async () => {
    const ws = await open();
    const closed = closeCode(ws);
    ws.send(JSON.stringify({ type: "webrtc", sdp: { type: "answer", sdp: "x" } }));
    expect(await closed).toBe(4003);
  });

  it("still closes with 4003 on an auth message missing credentials", async () => {
    const ws = await open();
    const closed = closeCode(ws);
    ws.send(JSON.stringify({ type: "auth", uid: "dev" }));
    expect(await closed).toBe(4003);
  });
});
