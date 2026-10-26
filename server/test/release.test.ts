/**
 * Release consistency (CLAUDE.md §9). If one of these fails, fix VERSION, the tag, or the
 * release notes — never loosen the test.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");

const VERSION = read("VERSION").trim();
const SEMVER = /^\d+\.\d+\.\d+$/;

function compareSemver(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

function releaseBlocks(): Array<{ version: string; body: string }> {
  const markdown = read("docs/RELEASE_NOTES.md");
  const block =
    /<!-- RELEASE_START version=([\d.]+) -->\s*([\s\S]*?)\s*<!-- RELEASE_END version=\1 -->/g;
  return [...markdown.matchAll(block)].map((m) => ({ version: m[1], body: m[2] }));
}

describe("release consistency", () => {
  it("VERSION is plain semver", () => {
    expect(VERSION).toMatch(SEMVER);
  });

  it("package.json versions match VERSION", () => {
    for (const pkg of ["server/package.json", "web/package.json"]) {
      expect(JSON.parse(read(pkg)).version, pkg).toBe(VERSION);
    }
  });

  it("VERSION equals the newest vX.Y.Z git tag", () => {
    const tags = execFileSync("git", ["tag", "--list", "v*"], { cwd: ROOT, encoding: "utf8" })
      .split(/\r?\n/)
      .map((tag) => tag.trim().replace(/^v/, ""))
      .filter((tag) => SEMVER.test(tag));
    expect(tags.length, "no vX.Y.Z tags found — CI must fetch tags").toBeGreaterThan(0);

    const newest = tags.sort(compareSemver).at(-1);
    expect(newest).toBe(VERSION);
  });

  it("the newest release-notes block is VERSION and blocks are newest first", () => {
    const versions = releaseBlocks().map((b) => b.version);
    expect(versions[0]).toBe(VERSION);
    const sorted = [...versions].sort((a, b) => compareSemver(b, a));
    expect(versions).toEqual(sorted);
  });

  it("every release block opens with '## vX.Y.Z — YYYY-MM-DD' for its own version", () => {
    for (const { version, body } of releaseBlocks()) {
      const heading = body.split(/\r?\n/)[0];
      expect(heading, `block ${version}`).toMatch(
        new RegExp(`^## v${version.replace(/\./g, "\\.")} — \\d{4}-\\d{2}-\\d{2}$`)
      );
    }
  });
});
