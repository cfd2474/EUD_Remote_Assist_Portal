import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { parseManifest, type ManifestInfo } from "./binaryXml.js";
import { readSignerCertificate } from "./signingBlock.js";
import { readZipDirectory, readZipEntry } from "./zip.js";

const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;

export interface ApkInfo extends ManifestInfo {
  /** SHA-256 of the signing certificate (DER), as apksigner --print-certs reports it. */
  signerSha256: string;
  /** SHA-256 of the whole file. */
  sha256: string;
  size: number;
}

export function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function fileSha256(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

export async function inspectApk(path: string): Promise<ApkInfo> {
  const fh = await open(path, "r");
  try {
    const { size } = await fh.stat();
    const directory = await readZipDirectory(fh, size);
    const manifestEntry = directory.entries.find((e) => e.name === "AndroidManifest.xml");
    if (!manifestEntry) throw new Error("APK has no AndroidManifest.xml");
    const manifest = parseManifest(await readZipEntry(fh, manifestEntry, MAX_MANIFEST_BYTES));
    const certificate = await readSignerCertificate(fh, directory.centralDirectoryOffset);
    return { ...manifest, signerSha256: sha256Hex(certificate), sha256: await fileSha256(path), size };
  } finally {
    await fh.close();
  }
}
