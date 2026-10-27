import { describe, expect, it } from "vitest";
import { documentationGuides } from "./index";
import { releaseNotes } from "./releaseNotes";

// Every admin UI source file as text (Vite resolves this at test time; tests excluded).
const sources = import.meta.glob(["../**/*.{ts,tsx}", "!../**/*.test.{ts,tsx}"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("built-in documentation (3.4.1+)", () => {
  it("guides and release notes are bundled and not empty", () => {
    expect(documentationGuides.length).toBeGreaterThan(0);
    for (const guide of documentationGuides) expect(guide.content.length).toBeGreaterThan(100);
    expect(releaseNotes.length).toBeGreaterThan(0);
  });

  it("nothing in the admin UI fetches documentation from GitHub", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    const offenders = Object.entries(sources)
      .filter(([, text]) => text.includes("raw.githubusercontent.com") || /fetch\([^)]*github/i.test(text))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});
