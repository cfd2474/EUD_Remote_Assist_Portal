import { describe, expect, it } from "vitest";
import { formatCommandForDevice } from "../src/services/commands.js";

const ICE = [{ urls: ["turn:turn.example.test:3479"], username: "u", credential: "c" }];

describe("formatCommandForDevice", () => {
  it("sends a bare command", () => {
    expect(formatCommandForDevice("TRIGGER_PING")).toEqual({ type: "command", command: "TRIGGER_PING" });
  });

  it("attaches the encrypted PIN only to REMOTE_UNLOCK", () => {
    expect(formatCommandForDevice("REMOTE_UNLOCK", { pin: "ciphertext" }).pin).toBe("ciphertext");
    expect(formatCommandForDevice("LOCK_DEVICE", { pin: "ciphertext" })).not.toHaveProperty("pin");
  });

  it("attaches ICE servers only to START_REMOTE_ADMIN", () => {
    expect(formatCommandForDevice("START_REMOTE_ADMIN", { iceServers: ICE }).iceServers).toEqual(ICE);
    expect(formatCommandForDevice("STOP_REMOTE_ADMIN", { iceServers: ICE })).not.toHaveProperty("iceServers");
  });
});
