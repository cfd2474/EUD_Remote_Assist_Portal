import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";

/**
 * Builds a minimal APK-shaped ZIP for tests: one AndroidManifest.xml entry, optionally an
 * APK Signing Block before the central directory. The fixtures were cut from the published
 * eud_3.1.4 APK (package com.cfd2474.eudremoteassist, versionCode 11, versionName 3.1.4).
 */
export const FIXTURE_DIR = join(import.meta.dirname, "..", "fixtures", "apk");
export const fixtureManifest = (): Buffer => readFileSync(join(FIXTURE_DIR, "manifest-3.1.4.axml"));
export const fixtureSigningBlock = (): Buffer => readFileSync(join(FIXTURE_DIR, "signing-block-3.1.4.bin"));
export const FIXTURE_SIGNER_SHA256 = "2094bccc054c681f46d8c812378c07657cf339dd7d4e80b546026b77aff2c644";

export interface BuildApkOptions {
  manifest?: Buffer;
  signingBlock?: Buffer | null;
  deflate?: boolean;
  entryName?: string;
}

export function buildApkBuffer(options: BuildApkOptions = {}): Buffer {
  const manifest = options.manifest ?? fixtureManifest();
  const signingBlock = options.signingBlock === undefined ? fixtureSigningBlock() : options.signingBlock;
  const data = options.deflate ? deflateRawSync(manifest) : manifest;
  const method = options.deflate ? 8 : 0;
  const name = Buffer.from(options.entryName ?? "AndroidManifest.xml", "utf8");

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(manifest.length, 22);
  local.writeUInt16LE(name.length, 26);

  const block = signingBlock ?? Buffer.alloc(0);
  const directoryOffset = local.length + name.length + data.length + block.length;

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(manifest.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + name.length, 12);
  eocd.writeUInt32LE(directoryOffset, 16);

  return Buffer.concat([local, name, data, block, central, name, eocd]);
}

/** Writes the APK to a fresh temp directory and returns its path. */
export function writeApk(options: BuildApkOptions = {}, fileName = "app.apk"): string {
  const dir = mkdtempSync(join(tmpdir(), "eud-apk-"));
  const path = join(dir, fileName);
  writeFileSync(path, buildApkBuffer(options));
  return path;
}

function replaceUnique(buf: Buffer, from: Buffer, to: Buffer, what: string): Buffer {
  const at = buf.indexOf(from);
  if (at < 0 || buf.indexOf(from, at + 1) >= 0) throw new Error(`fixture: ${what} not found exactly once`);
  const out = Buffer.from(buf);
  to.copy(out, at);
  return out;
}

/** The fixture manifest with another versionCode (the typed int Res_value 0x10 holding 11). */
export function manifestWithVersionCode(versionCode: number, manifest = fixtureManifest()): Buffer {
  const resValue = (n: number) => {
    const b = Buffer.from([0x08, 0x00, 0x00, 0x10, 0, 0, 0, 0]);
    b.writeUInt32LE(n, 4);
    return b;
  };
  return replaceUnique(manifest, resValue(11), resValue(versionCode), "versionCode 11");
}

/** The fixture manifest with a same-length versionName, e.g. "3.1.5". */
export function manifestWithVersionName(versionName: string, manifest = fixtureManifest()): Buffer {
  if (versionName.length !== 5) throw new Error("fixture: versionName must be 5 characters");
  // The fixture's string pool is UTF-16 (aapt's default for manifests).
  const utf16 = (text: string) => Buffer.from(text, "utf16le");
  return replaceUnique(manifest, utf16("3.1.4"), utf16(versionName), "versionName 3.1.4");
}

/** The fixture manifest with a different (same-length) package name. */
export function manifestWithOtherPackage(manifest = fixtureManifest()): Buffer {
  // The UTF-16 string-pool entry itself: length 27, the name, a 2-byte terminator. The name
  // also occurs inside longer strings (authorities, permissions), which this doesn't touch.
  const entry = (name: string) =>
    Buffer.concat([Buffer.from([27, 0]), Buffer.from(name, "utf16le"), Buffer.from([0, 0])]);
  return replaceUnique(manifest, entry("com.cfd2474.eudremoteassist"), entry("com.cfd2474.eudremoteassisX"), "package name");
}

/** The fixture signing block with one byte of the certificate's subject changed: another signer. */
export function signingBlockWithOtherSigner(block = fixtureSigningBlock()): Buffer {
  const out = Buffer.from(block);
  const at = out.indexOf(Buffer.from("Leckliter"));
  if (at < 0) throw new Error("fixture: certificate subject not found");
  out[at] = "X".charCodeAt(0);
  return out;
}
