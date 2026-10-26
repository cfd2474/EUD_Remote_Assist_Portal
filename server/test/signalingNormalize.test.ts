import { describe, expect, it } from "vitest";
import {
  describeSignaling,
  isSignalingMessage,
  normalizeSignaling,
  toWebRtcPayload,
} from "../src/services/signalingNormalize.js";

const SDP = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n";

describe("normalizeSignaling", () => {
  it("accepts the canonical portal shape", () => {
    expect(
      normalizeSignaling({ type: "webrtc", sdp: { type: "answer", sdp: SDP } })
    ).toEqual({ type: "webrtc", sdp: { type: "answer", sdp: SDP } });
  });

  it("accepts a flat string SDP with its type on the message", () => {
    expect(normalizeSignaling({ type: "answer", sdp: SDP })?.sdp).toEqual({
      type: "answer",
      sdp: SDP,
    });
  });

  it("accepts the legacy signal field", () => {
    expect(normalizeSignaling({ signal: "offer", sdp: SDP })?.sdp?.type).toBe("offer");
  });

  it("unwraps SDP nested under payload or data", () => {
    expect(
      normalizeSignaling({ type: "x", payload: { type: "answer", sdp: SDP } })?.sdp?.type
    ).toBe("answer");
    expect(
      normalizeSignaling({ type: "x", data: { sdp: { type: "offer", sdp: SDP } } })?.sdp?.type
    ).toBe("offer");
  });

  it("accepts ICE as a nested object or flat fields", () => {
    const ice = { candidate: "candidate:1 1 udp 1 1.2.3.4 5 typ host", sdpMid: "0", sdpMLineIndex: 0 };
    expect(normalizeSignaling({ type: "webrtc", ice })?.ice).toEqual(ice);
    expect(normalizeSignaling({ type: "ice_candidate", ...ice })?.ice).toEqual(ice);
  });

  it("drops ICE fields of the wrong type instead of passing them through", () => {
    const result = normalizeSignaling({
      ice: { candidate: "candidate:1", sdpMid: 0, sdpMLineIndex: "0" },
    });
    expect(result?.ice).toEqual({ candidate: "candidate:1", sdpMid: undefined, sdpMLineIndex: undefined });
  });

  it("rejects an unknown SDP type and non-signaling messages", () => {
    expect(normalizeSignaling({ sdp: { type: "bogus", sdp: SDP } })).toBeNull();
    expect(normalizeSignaling({ type: "ping" })).toBeNull();
    expect(normalizeSignaling({ type: "device_event", event: "X", uid: "u" })).toBeNull();
  });
});

describe("isSignalingMessage / describeSignaling / toWebRtcPayload", () => {
  it("classifies messages", () => {
    expect(isSignalingMessage({ type: "webrtc" })).toBe(true);
    expect(isSignalingMessage({ signal: "ice" })).toBe(true);
    expect(isSignalingMessage({ type: "ping" })).toBe(false);
  });

  it("describes messages for logs", () => {
    expect(describeSignaling({ type: "ping" })).toBe("ping");
    expect(describeSignaling({ type: "webrtc", sdp: { type: "offer", sdp: SDP } })).toBe("webrtc sdp=offer");
    expect(describeSignaling({ event: "LOCKED", uid: "u" })).toBe("device_event event=LOCKED");
    expect(describeSignaling({ foo: 1 })).toBe("unrecognized keys=foo");
  });

  it("builds a payload with only the parts present", () => {
    expect(toWebRtcPayload({ type: "webrtc", ice: { candidate: "c" } })).toEqual({
      type: "webrtc",
      ice: { candidate: "c" },
    });
  });
});
