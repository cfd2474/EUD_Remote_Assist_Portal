import type { FileHandle } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

/** Minimal ZIP reader for APKs (PKWARE APPNOTE; see PLATFORM_REFERENCE §13). No ZIP64. */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT_SIZE = 0xffff;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

export interface ZipDirectory {
  /** Where the central directory starts; the APK Signing Block ends right before it. */
  centralDirectoryOffset: number;
  entries: ZipEntry[];
}

export async function readAt(fh: FileHandle, offset: number, length: number): Promise<Buffer> {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await fh.read(buf, 0, length, offset);
  if (bytesRead !== length) {
    throw new Error(`Unexpected end of file reading ${length} bytes at ${offset}`);
  }
  return buf;
}

export async function readZipDirectory(fh: FileHandle, fileSize: number): Promise<ZipDirectory> {
  const tailLength = Math.min(fileSize, EOCD_MIN_SIZE + MAX_COMMENT_SIZE);
  if (tailLength < EOCD_MIN_SIZE) throw new Error("Not a ZIP file (too small)");
  const tail = await readAt(fh, fileSize - tailLength, tailLength);

  let eocd = -1;
  for (let i = tail.length - EOCD_MIN_SIZE; i >= 0; i--) {
    if (tail.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a ZIP file (no end of central directory)");

  const entryCount = tail.readUInt16LE(eocd + 10);
  const directorySize = tail.readUInt32LE(eocd + 12);
  const directoryOffset = tail.readUInt32LE(eocd + 16);
  if (entryCount === 0xffff || directoryOffset === 0xffffffff) {
    throw new Error("ZIP64 archives are not supported");
  }
  if (directoryOffset + directorySize > fileSize) {
    throw new Error("Corrupt ZIP (central directory outside the file)");
  }

  const directory = await readAt(fh, directoryOffset, directorySize);
  const entries: ZipEntry[] = [];
  let p = 0;
  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > directory.length || directory.readUInt32LE(p) !== CENTRAL_HEADER_SIGNATURE) {
      throw new Error("Corrupt ZIP central directory");
    }
    const nameLength = directory.readUInt16LE(p + 28);
    const extraLength = directory.readUInt16LE(p + 30);
    const commentLength = directory.readUInt16LE(p + 32);
    entries.push({
      method: directory.readUInt16LE(p + 10),
      compressedSize: directory.readUInt32LE(p + 20),
      uncompressedSize: directory.readUInt32LE(p + 24),
      localHeaderOffset: directory.readUInt32LE(p + 42),
      name: directory.toString("utf8", p + 46, p + 46 + nameLength),
    });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return { centralDirectoryOffset: directoryOffset, entries };
}

/** Sizes come from the central directory, which is authoritative even with data descriptors. */
export async function readZipEntry(fh: FileHandle, entry: ZipEntry, maxSize: number): Promise<Buffer> {
  if (entry.uncompressedSize > maxSize) {
    throw new Error(`${entry.name} is larger than ${maxSize} bytes`);
  }
  const local = await readAt(fh, entry.localHeaderOffset, 30);
  if (local.readUInt32LE(0) !== LOCAL_HEADER_SIGNATURE) {
    throw new Error(`Corrupt ZIP local header for ${entry.name}`);
  }
  const dataStart = entry.localHeaderOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
  const raw = await readAt(fh, dataStart, entry.compressedSize);
  if (entry.method === METHOD_STORED) return raw;
  if (entry.method === METHOD_DEFLATE) return inflateRawSync(raw, { maxOutputLength: maxSize });
  throw new Error(`Unsupported ZIP compression method ${entry.method} for ${entry.name}`);
}
