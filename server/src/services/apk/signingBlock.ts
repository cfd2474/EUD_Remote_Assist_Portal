import type { FileHandle } from "node:fs/promises";
import { readAt } from "./zip.js";

/**
 * Finds the signing certificate in the APK Signing Block (APK Signature Scheme v2/v3;
 * see PLATFORM_REFERENCE §13). This identifies the signer; it does not verify the signature.
 * Android verifies it on install, and the release check runs apksigner.
 */

const MAGIC = Buffer.from("APK Sig Block 42", "ascii");
const V2_BLOCK_ID = 0x7109871a;
const V3_BLOCK_ID = 0xf05368c0;
const MAX_BLOCK_SIZE = 16 * 1024 * 1024;

function lengthPrefixed(buf: Buffer, offset: number): Buffer {
  if (offset + 4 > buf.length) throw new Error("Corrupt APK signature (truncated length)");
  const length = buf.readUInt32LE(offset);
  if (offset + 4 + length > buf.length) throw new Error("Corrupt APK signature (length past end)");
  return buf.subarray(offset + 4, offset + 4 + length);
}

/** DER bytes of the first signer's first certificate (v3 preferred, else v2). */
export async function readSignerCertificate(
  fh: FileHandle,
  centralDirectoryOffset: number
): Promise<Buffer> {
  const notSigned = new Error("APK is not signed with APK Signature Scheme v2 or v3");
  if (centralDirectoryOffset < 32) throw notSigned;
  const footer = await readAt(fh, centralDirectoryOffset - 24, 24);
  if (!footer.subarray(8).equals(MAGIC)) throw notSigned;

  const blockSize = Number(footer.readBigUInt64LE(0));
  const blockStart = centralDirectoryOffset - blockSize - 8;
  if (blockSize < 24 || blockSize > MAX_BLOCK_SIZE || blockStart < 0) {
    throw new Error("Corrupt APK Signing Block size");
  }
  const block = await readAt(fh, blockStart, blockSize + 8);
  if (Number(block.readBigUInt64LE(0)) !== blockSize) {
    throw new Error("Corrupt APK Signing Block (sizes differ)");
  }

  const pairs = new Map<number, Buffer>();
  const pairsEnd = block.length - 24;
  for (let p = 8; p < pairsEnd; ) {
    const pairLength = Number(block.readBigUInt64LE(p));
    if (pairLength < 4 || p + 8 + pairLength > pairsEnd) throw new Error("Corrupt APK Signing Block pair");
    pairs.set(block.readUInt32LE(p + 8), block.subarray(p + 12, p + 8 + pairLength));
    p += 8 + pairLength;
  }

  const scheme = pairs.get(V3_BLOCK_ID) ?? pairs.get(V2_BLOCK_ID);
  if (!scheme) throw notSigned;
  // signers → first signer → signed data → (digests, certificates) → first certificate
  const signer = lengthPrefixed(lengthPrefixed(scheme, 0), 0);
  const signedData = lengthPrefixed(signer, 0);
  const digests = lengthPrefixed(signedData, 0);
  const certificates = lengthPrefixed(signedData, 4 + digests.length);
  return lengthPrefixed(certificates, 0);
}
