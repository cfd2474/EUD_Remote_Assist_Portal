import { describe, expect, it } from "vitest";
import { pointOnVideo, streamMeta, swipeDurationMs, videoRenderRect } from "./videoCoordinates";

/** Minimal stand-in for a rendered <video>: element box plus intrinsic stream size. */
function fakeVideo(box: { left: number; top: number; width: number; height: number }, videoWidth: number, videoHeight: number) {
  return {
    videoWidth,
    videoHeight,
    getBoundingClientRect: () => ({ ...box, right: box.left + box.width, bottom: box.top + box.height }),
  } as unknown as HTMLVideoElement;
}

describe("videoRenderRect (object-fit: contain)", () => {
  it("pillarboxes a portrait stream in a landscape element", () => {
    // 1000x500 element, 1080x2160 stream → 250 px wide frame centred horizontally.
    const frame = videoRenderRect(fakeVideo({ left: 0, top: 0, width: 1000, height: 500 }, 1080, 2160));
    expect(frame).toMatchObject({ left: 375, top: 0, width: 250, height: 500 });
  });

  it("letterboxes a landscape stream in a portrait element", () => {
    const frame = videoRenderRect(fakeVideo({ left: 10, top: 20, width: 400, height: 800 }, 1600, 800));
    expect(frame).toMatchObject({ left: 10, top: 320, width: 400, height: 200 });
  });

  it("falls back to the element box before the stream has a size", () => {
    const frame = videoRenderRect(fakeVideo({ left: 5, top: 6, width: 100, height: 50 }, 0, 0));
    expect(frame).toMatchObject({ left: 5, top: 6, width: 100, height: 50 });
  });
});

describe("pointOnVideo", () => {
  const video = fakeVideo({ left: 0, top: 0, width: 1000, height: 500 }, 1080, 2160);

  it("maps a click to fractions of the device screen, ignoring the bars", () => {
    expect(pointOnVideo(video, 375, 0)).toEqual({ x_percent: 0, y_percent: 0 });
    expect(pointOnVideo(video, 500, 250)).toEqual({ x_percent: 0.5, y_percent: 0.5 });
    expect(pointOnVideo(video, 625, 500)).toEqual({ x_percent: 1, y_percent: 1 });
  });

  it("clamps clicks on the letterbox bars to the screen edge", () => {
    expect(pointOnVideo(video, 10, 250)).toEqual({ x_percent: 0, y_percent: 0.5 });
    expect(pointOnVideo(video, 990, 250)).toEqual({ x_percent: 1, y_percent: 0.5 });
  });
});

describe("swipeDurationMs", () => {
  it("stays between 250 and 900 ms", () => {
    const a = { x_percent: 0, y_percent: 0 };
    expect(swipeDurationMs(a, a, 0)).toBe(250);
    expect(swipeDurationMs(a, { x_percent: 1, y_percent: 1 }, 0)).toBe(900);
    expect(swipeDurationMs(a, { x_percent: 0.1, y_percent: 0 }, 600)).toBe(600);
  });
});

describe("streamMeta", () => {
  it("reports the stream size only once it is known", () => {
    expect(streamMeta(fakeVideo({ left: 0, top: 0, width: 1, height: 1 }, 1080, 2160))).toEqual({
      stream_width: 1080,
      stream_height: 2160,
    });
    expect(streamMeta(fakeVideo({ left: 0, top: 0, width: 1, height: 1 }, 0, 0))).toEqual({});
  });
});
