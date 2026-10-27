import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_RELEASE_NOTES_FILE, readAppReleaseNotes } from "../src/services/appReleaseNotes.js";

const NOTES = `# EUD Remote Assist App — Release Notes

---

## v3.3.0 — 2026-10-27

- **Update notice.** The app tells you when the console has a newer version.

## v3.2.1 — 2026-10-25

- Registers on resume.
`;

function seedDirWith(text?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "eud-notes-"));
  if (text !== undefined) writeFileSync(join(dir, APP_RELEASE_NOTES_FILE), text);
  return dir;
}

describe("readAppReleaseNotes", () => {
  it("returns the body of the matching version's section", async () => {
    expect(await readAppReleaseNotes("3.3.0", seedDirWith(NOTES))).toBe(
      "- **Update notice.** The app tells you when the console has a newer version."
    );
    expect(await readAppReleaseNotes("3.2.1", seedDirWith(NOTES))).toBe("- Registers on resume.");
  });

  it("doesn't match a version that only starts the same", async () => {
    expect(await readAppReleaseNotes("3.3", seedDirWith(NOTES))).toBe("");
  });

  it("is empty when the file or the section is missing", async () => {
    expect(await readAppReleaseNotes("9.9.9", seedDirWith(NOTES))).toBe("");
    expect(await readAppReleaseNotes("3.3.0", seedDirWith())).toBe("");
  });
});
