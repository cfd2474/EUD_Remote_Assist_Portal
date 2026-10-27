import { describe, expect, it } from "vitest";
import { isDeviceRenegotiationOffer, parseInboundSignaling } from "./webrtcSignaling";

const SDP = "v=0\r\n";

describe("parseInboundSignaling", () => {
  it("reads the canonical server shape", () => {
    expect(parseInboundSignaling({ type: "webrtc", sdp: { type: "answer", sdp: SDP } })).toEqual({
      sdp: { type: "answer", sdp: SDP },
    });
    const ice = { candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 };
    expect(parseInboundSignaling({ type: "webrtc", ice })).toEqual({ ice });
  });

  it("reads string SDP with the type on the message or in the legacy signal field", () => {
    expect(parseInboundSignaling({ type: "answer", sdp: SDP }).sdp).toEqual({ type: "answer", sdp: SDP });
    expect(parseInboundSignaling({ signal: "offer", sdp: SDP }).sdp).toEqual({ type: "offer", sdp: SDP });
  });

  it("ignores ICE without a candidate and messages with nothing to parse", () => {
    expect(parseInboundSignaling({ type: "webrtc", ice: { sdpMid: "0" } })).toEqual({});
    expect(parseInboundSignaling({ type: "device_status" })).toEqual({});
  });
});

describe("isDeviceRenegotiationOffer", () => {
  it("is true only for an offer that sends video (device-initiated)", () => {
    expect(isDeviceRenegotiationOffer({ type: "offer", sdp: "m=video\r\na=sendonly\r\n" })).toBe(true);
    expect(isDeviceRenegotiationOffer({ type: "offer", sdp: "m=video\r\na=recvonly\r\n" })).toBe(false);
    expect(isDeviceRenegotiationOffer({ type: "answer", sdp: "a=sendonly" })).toBe(false);
  });
});
