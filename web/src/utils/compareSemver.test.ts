import { describe, expect, it } from "vitest";
import { compareSemver, isNewerVersion } from "./compareSemver";

describe("compareSemver", () => {
  it("compares numerically, part by part", () => {
    expect(compareSemver("2.2.10", "2.2.9")).toBeGreaterThan(0);
    expect(compareSemver("3.0.0", "2.99.99")).toBeGreaterThan(0);
    expect(compareSemver("3.1.5", "3.1.5")).toBe(0);
  });

  it("treats missing parts as zero", () => {
    expect(compareSemver("3.1", "3.1.0")).toBe(0);
  });
});

describe("isNewerVersion", () => {
  it("is true only when latest is strictly newer", () => {
    expect(isNewerVersion("3.1.5", "3.1.4")).toBe(true);
    expect(isNewerVersion("3.1.4", "3.1.4")).toBe(false);
    expect(isNewerVersion("3.1.3", "3.1.4")).toBe(false);
  });

  it("is false when either side is unknown", () => {
    expect(isNewerVersion(null, "3.1.4")).toBe(false);
    expect(isNewerVersion("3.1.5", "  ")).toBe(false);
  });
});
