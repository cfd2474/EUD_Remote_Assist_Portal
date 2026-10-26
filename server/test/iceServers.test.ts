import { describe, expect, it } from "vitest";
import { buildIceServers, isValidStunUrl, isValidTurnUrl } from "../src/services/iceServers.js";

const GOOGLE = "stun:stun.l.google.com:19302";

describe("buildIceServers", () => {
  it("with the default STUN and no TURN, gives the device the same STUN it uses today", () => {
    expect(buildIceServers([GOOGLE])).toEqual([{ urls: [GOOGLE] }]);
  });

  it("always sends urls as an array (the Android app parses it with getAsJsonArray)", () => {
    const servers = buildIceServers([GOOGLE], { url: "turn:203.0.113.10:3479", username: "u", credential: "p" });
    for (const server of servers) {
      expect(Array.isArray(server.urls)).toBe(true);
    }
    expect(servers).toEqual([
      { urls: [GOOGLE] },
      { urls: ["turn:203.0.113.10:3479"], username: "u", credential: "p" },
    ]);
  });

  it("omits empty credentials instead of sending undefined or empty strings", () => {
    expect(buildIceServers([], { url: "turns:turn.example.test:5349" })).toEqual([
      { urls: ["turns:turn.example.test:5349"] },
    ]);
  });

  it("groups several STUN URLs into one entry", () => {
    expect(buildIceServers(["stun:a.test:3478", "stuns:b.test:5349"])).toEqual([
      { urls: ["stun:a.test:3478", "stuns:b.test:5349"] },
    ]);
  });

  it("is empty when STUN is turned off and there is no TURN", () => {
    expect(buildIceServers([])).toEqual([]);
  });

  it("drops and reports invalid URLs rather than sending them", () => {
    const invalid: string[] = [];
    const servers = buildIceServers(
      ["stun:ok.test:3478", "http://not-stun", "turn:in-the-stun-list"],
      { url: "stun:wrong-scheme-for-turn" },
      (url) => invalid.push(url)
    );
    expect(servers).toEqual([{ urls: ["stun:ok.test:3478"] }]);
    expect(invalid).toEqual(["http://not-stun", "turn:in-the-stun-list", "stun:wrong-scheme-for-turn"]);
  });
});

describe("URL validation", () => {
  it("accepts stun:/stuns: and turn:/turns: (with ?transport=) only", () => {
    expect(isValidStunUrl("stun:host:3478")).toBe(true);
    expect(isValidStunUrl("stun:host:3478?transport=udp")).toBe(false);
    expect(isValidTurnUrl("turn:host:3479?transport=udp")).toBe(true);
    expect(isValidTurnUrl("turn:")).toBe(false);
    expect(isValidTurnUrl("turn:host with space")).toBe(false);
  });
});
