import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

export const APP_RELEASE_NOTES_FILE = "app-release-notes.md";

/**
 * The "## vX.Y.Z" section for one app version from dist/app-release-notes.md (the app repo's
 * RELEASE_NOTES.md, committed next to the APK). Empty when the file or the section is missing.
 */
export async function readAppReleaseNotes(
  versionName: string,
  seedDir = config.appBuilds.seedDir
): Promise<string> {
  let text: string;
  try {
    text = await readFile(path.join(seedDir, APP_RELEASE_NOTES_FILE), "utf8");
  } catch {
    return "";
  }
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const heading = new RegExp(`^##\\s+v?${versionName.replace(/\./g, "\\.")}(\\s|$)`);
  const start = lines.findIndex((line) => heading.test(line));
  if (start < 0) return "";
  const end = lines.findIndex((line, i) => i > start && /^##\s/.test(line));
  return lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join("\n")
    .replace(/^\s*---\s*$/gm, "")
    .trim();
}
