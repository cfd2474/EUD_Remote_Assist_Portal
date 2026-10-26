import { describe, expect, it } from "vitest";
import { getReleaseNote, parseReleaseNotes, releaseNotes } from "./releaseNotes";

const block = (version: string, body: string, endVersion = version) =>
  `<!-- RELEASE_START version=${version} -->\n${body}\n<!-- RELEASE_END version=${endVersion} -->`;

describe("parseReleaseNotes", () => {
  it("returns blocks newest first, compared as semver rather than text", () => {
    const markdown = [block("2.2.9", "a"), block("2.2.10", "b"), block("3.0.0", "c")].join("\n\n");
    expect(parseReleaseNotes(markdown).map((n) => n.version)).toEqual(["3.0.0", "2.2.10", "2.2.9"]);
  });

  it("ignores a block whose END marker names a different version", () => {
    expect(parseReleaseNotes(block("1.0.0", "x", "1.0.1"))).toEqual([]);
  });

  it("ignores empty blocks and trims content", () => {
    const notes = parseReleaseNotes([block("1.0.0", "   "), block("1.0.1", "\n  body  \n")].join("\n"));
    expect(notes).toEqual([{ version: "1.0.1", content: "body" }]);
  });
});

describe("bundled docs/RELEASE_NOTES.md", () => {
  it("parses, and its newest entry is the portal version", () => {
    expect(releaseNotes.length).toBeGreaterThan(0);
    expect(releaseNotes[0].version).toBe(__PORTAL_VERSION__);
    expect(getReleaseNote(__PORTAL_VERSION__)?.content).toMatch(/^## v\d+\.\d+\.\d+ — \d{4}-\d{2}-\d{2}/);
  });

  it("returns undefined for unknown or missing versions", () => {
    expect(getReleaseNote("0.0.0")).toBeUndefined();
    expect(getReleaseNote(undefined)).toBeUndefined();
  });
});
