/**
 * Reads package, versionCode and versionName from a compiled AndroidManifest.xml
 * (Android binary XML, AOSP ResourceTypes.h; see PLATFORM_REFERENCE §13).
 */

const RES_STRING_POOL_TYPE = 0x0001;
const RES_XML_TYPE = 0x0003;
const RES_XML_START_ELEMENT_TYPE = 0x0102;
const RES_XML_RESOURCE_MAP_TYPE = 0x0180;
const UTF8_FLAG = 1 << 8;
const NO_INDEX = 0xffffffff;
const TYPE_STRING = 0x03;
const TYPE_INT_DEC = 0x10;
const TYPE_INT_HEX = 0x11;
/** android:versionCode and android:versionName (matched by resource id, not by name). */
const ATTR_VERSION_CODE = 0x0101021b;
const ATTR_VERSION_NAME = 0x0101021c;

export interface ManifestInfo {
  packageName: string;
  versionCode: number;
  versionName: string;
}

function readLength8(buf: Buffer, p: number): { value: number; bytes: number } {
  const b = buf[p];
  return b & 0x80 ? { value: ((b & 0x7f) << 8) | buf[p + 1], bytes: 2 } : { value: b, bytes: 1 };
}

function readStringPool(buf: Buffer, start: number): string[] {
  const headerSize = buf.readUInt16LE(start + 2);
  const stringCount = buf.readUInt32LE(start + 8);
  const utf8 = (buf.readUInt32LE(start + 16) & UTF8_FLAG) !== 0;
  const stringsStart = start + buf.readUInt32LE(start + 20);
  const strings: string[] = [];
  for (let i = 0; i < stringCount; i++) {
    let p = stringsStart + buf.readUInt32LE(start + headerSize + i * 4);
    if (utf8) {
      p += readLength8(buf, p).bytes; // UTF-16 length, unused
      const { value, bytes } = readLength8(buf, p);
      p += bytes;
      strings.push(buf.toString("utf8", p, p + value));
    } else {
      let length = buf.readUInt16LE(p);
      p += 2;
      if (length & 0x8000) {
        length = ((length & 0x7fff) << 16) | buf.readUInt16LE(p);
        p += 2;
      }
      strings.push(buf.toString("utf16le", p, p + length * 2));
    }
  }
  return strings;
}

function readManifestAttributes(
  buf: Buffer,
  ext: number,
  strings: string[],
  resourceIds: number[]
): ManifestInfo {
  const attributeStart = buf.readUInt16LE(ext + 8);
  const attributeSize = buf.readUInt16LE(ext + 10);
  const attributeCount = buf.readUInt16LE(ext + 12);
  let packageName: string | undefined;
  let versionCode: number | undefined;
  let versionName: string | undefined;

  for (let i = 0; i < attributeCount; i++) {
    const a = ext + attributeStart + i * attributeSize;
    const nameIndex = buf.readUInt32LE(a + 4);
    const rawValue = buf.readUInt32LE(a + 8);
    const dataType = buf[a + 15];
    const data = buf.readUInt32LE(a + 16);
    const text =
      rawValue !== NO_INDEX ? strings[rawValue] : dataType === TYPE_STRING ? strings[data] : undefined;
    const resourceId = nameIndex < resourceIds.length ? resourceIds[nameIndex] : undefined;

    if (resourceId === ATTR_VERSION_CODE) {
      versionCode = dataType === TYPE_INT_DEC || dataType === TYPE_INT_HEX ? data : Number(text);
    } else if (resourceId === ATTR_VERSION_NAME) {
      versionName = text;
    } else if (resourceId === undefined && strings[nameIndex] === "package") {
      packageName = text;
    }
  }

  if (!packageName) throw new Error("Manifest has no package name");
  if (versionCode === undefined || !Number.isInteger(versionCode)) {
    throw new Error("Manifest has no integer android:versionCode");
  }
  if (!versionName) throw new Error("Manifest has no android:versionName");
  return { packageName, versionCode, versionName };
}

export function parseManifest(buf: Buffer): ManifestInfo {
  if (buf.length < 8 || buf.readUInt16LE(0) !== RES_XML_TYPE) {
    throw new Error("AndroidManifest.xml is not compiled binary XML");
  }
  let strings: string[] = [];
  let resourceIds: number[] = [];
  let p = buf.readUInt16LE(2);
  while (p + 8 <= buf.length) {
    const type = buf.readUInt16LE(p);
    const headerSize = buf.readUInt16LE(p + 2);
    const size = buf.readUInt32LE(p + 4);
    if (size < 8 || p + size > buf.length) throw new Error("Corrupt binary XML chunk");

    if (type === RES_STRING_POOL_TYPE) {
      strings = readStringPool(buf, p);
    } else if (type === RES_XML_RESOURCE_MAP_TYPE) {
      resourceIds = [];
      for (let q = p + headerSize; q + 4 <= p + size; q += 4) resourceIds.push(buf.readUInt32LE(q));
    } else if (type === RES_XML_START_ELEMENT_TYPE) {
      const ext = p + headerSize;
      if (strings[buf.readUInt32LE(ext + 4)] === "manifest") {
        return readManifestAttributes(buf, ext, strings, resourceIds);
      }
    }
    p += size;
  }
  throw new Error("Manifest has no <manifest> element");
}
