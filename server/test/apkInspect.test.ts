import { describe, expect, it } from "vitest";
import { inspectApk } from "../src/services/apk/inspect.js";
import { parseManifest } from "../src/services/apk/binaryXml.js";
import {
  FIXTURE_SIGNER_SHA256,
  fixtureManifest,
  fixtureSigningBlock,
  writeApk,
} from "./helpers/buildApk.js";

describe("parseManifest", () => {
  it("reads package, versionCode and versionName from the published 3.1.4 manifest", () => {
    expect(parseManifest(fixtureManifest())).toEqual({
      packageName: "com.cfd2474.eudremoteassist",
      versionCode: 11,
      versionName: "3.1.4",
    });
  });

  it("rejects text XML and truncated input", () => {
    expect(() => parseManifest(Buffer.from("<manifest package=\"x\"/>"))).toThrow(/binary XML/);
    expect(() => parseManifest(fixtureManifest().subarray(0, 200))).toThrow();
  });
});

describe("inspectApk", () => {
  it("reads the manifest and signer from a stored entry", async () => {
    const info = await inspectApk(writeApk());
    expect(info).toMatchObject({
      packageName: "com.cfd2474.eudremoteassist",
      versionCode: 11,
      versionName: "3.1.4",
      signerSha256: FIXTURE_SIGNER_SHA256,
    });
    expect(info.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(info.size).toBeGreaterThan(30_000);
  });

  it("reads a deflated manifest entry", async () => {
    const info = await inspectApk(writeApk({ deflate: true }));
    expect(info.versionCode).toBe(11);
  });

  it("refuses an APK without an APK Signing Block", async () => {
    await expect(inspectApk(writeApk({ signingBlock: null }))).rejects.toThrow(/not signed/);
  });

  it("refuses a corrupt signing block", async () => {
    const block = Buffer.from(fixtureSigningBlock());
    block.writeBigUInt64LE(5n, 0);
    await expect(inspectApk(writeApk({ signingBlock: block }))).rejects.toThrow(/Signing Block/);
  });

  it("refuses an APK without AndroidManifest.xml", async () => {
    await expect(inspectApk(writeApk({ entryName: "classes.dex" }))).rejects.toThrow(/no AndroidManifest/);
  });

  it("refuses a file that is not a ZIP", async () => {
    const path = writeApk();
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path, Buffer.alloc(4096, 7));
    await expect(inspectApk(path)).rejects.toThrow(/Not a ZIP/);
  });
});
