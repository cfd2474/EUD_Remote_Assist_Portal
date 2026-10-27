import { describe, expect, it } from "vitest";
import {
  downsampleLocationHistory,
  locationHistoryBucketKey,
  type LocationHistoryPoint,
} from "../src/services/locationHistory.js";

const NOW = new Date("2026-10-25T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const point = (m: number): LocationHistoryPoint => ({
  lat: 33 + m / 1000,
  lon: -117,
  accuracy_m: 5,
  recorded_at: minutesAgo(m),
});

describe("locationHistoryBucketKey", () => {
  it("uses 15-minute buckets up to 6 hours", () => {
    expect(locationHistoryBucketKey(minutesAgo(0), NOW)).toBe(0);
    expect(locationHistoryBucketKey(minutesAgo(14), NOW)).toBe(0);
    expect(locationHistoryBucketKey(minutesAgo(15), NOW)).toBe(1);
    expect(locationHistoryBucketKey(minutesAgo(360), NOW)).toBe(24);
  });

  it("uses hourly, then 6-hour, then daily buckets", () => {
    expect(locationHistoryBucketKey(minutesAgo(361), NOW)).toBe(24);
    expect(locationHistoryBucketKey(minutesAgo(420), NOW)).toBe(25);
    expect(locationHistoryBucketKey(minutesAgo(2881), NOW)).toBe(66);
    expect(locationHistoryBucketKey(minutesAgo(5761), NOW)).toBe(74);
  });

  it("returns null for points from the future", () => {
    expect(locationHistoryBucketKey(minutesAgo(-1), NOW)).toBeNull();
  });
});

describe("downsampleLocationHistory", () => {
  it("keeps every point from the last 2 hours", () => {
    const points = [1, 2, 3, 30, 60, 119].map(point);
    expect(downsampleLocationHistory(points, NOW)).toHaveLength(6);
  });

  it("keeps only the newest point per bucket after 2 hours", () => {
    // 200 and 205 minutes ago share 15-minute bucket 13; 1000 and 1010 share hourly bucket 34.
    const points = [200, 205, 1000, 1010].map(point);
    const sampled = downsampleLocationHistory(points, NOW);
    expect(sampled.map((p) => p.recorded_at)).toEqual([
      minutesAgo(200).toISOString(),
      minutesAgo(1000).toISOString(),
    ]);
  });

  it("drops future points and numbers the result from 1", () => {
    const sampled = downsampleLocationHistory([point(-5), point(1), point(500)], NOW);
    expect(sampled.map((p) => p.number)).toEqual([1, 2]);
  });
});
