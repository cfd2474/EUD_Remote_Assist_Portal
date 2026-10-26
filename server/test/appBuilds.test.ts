import { describe, expect, it } from "vitest";
import { appUpdateOffer, type AppBuild } from "../src/services/appBuilds.js";
import { parseManifest } from "../src/services/apk/binaryXml.js";
import {
  manifestWithOtherPackage,
  manifestWithVersionCode,
  manifestWithVersionName,
} from "./helpers/buildApk.js";

const build: AppBuild = {
  sha256: "a".repeat(64),
  packageName: "com.cfd2474.eudremoteassist",
  versionCode: 14,
  versionName: "3.3.0",
  signerSha256: "b".repeat(64),
  size: 1234,
  sourceName: "eud-remote-assist.apk",
  createdAt: new Date(0),
};

describe("appUpdateOffer", () => {
  it("offers the current build to a device on an older version", () => {
    expect(appUpdateOffer(build, "3.2.1")).toMatchObject({
      versionCode: 14,
      versionName: "3.3.0",
      sha256: build.sha256,
      size: 1234,
    });
    expect(appUpdateOffer(build, "3.2.1")?.url).toMatch(/\/api\/v1\/app\/apk$/);
  });

  it("offers nothing to a device on the same or a newer version", () => {
    expect(appUpdateOffer(build, "3.3.0")).toBeNull();
    expect(appUpdateOffer(build, "v3.3.0")).toBeNull();
    expect(appUpdateOffer(build, "3.4.0")).toBeNull();
  });

  it("offers to a device whose version is unknown (the app checks versionCode itself)", () => {
    expect(appUpdateOffer(build, null)).not.toBeNull();
    expect(appUpdateOffer(build, "unknown")).not.toBeNull();
  });

  it("offers nothing when the console has no build", () => {
    expect(appUpdateOffer(null, "1.0.0")).toBeNull();
  });
});

describe("fixture patchers (used by the import tests)", () => {
  it("change exactly the intended manifest fields", () => {
    expect(parseManifest(manifestWithVersionCode(20))).toMatchObject({ versionCode: 20, versionName: "3.1.4" });
    expect(parseManifest(manifestWithVersionName("3.1.5"))).toMatchObject({ versionCode: 11, versionName: "3.1.5" });
    expect(parseManifest(manifestWithOtherPackage()).packageName).toBe("com.cfd2474.eudremoteassisX");
  });
});
