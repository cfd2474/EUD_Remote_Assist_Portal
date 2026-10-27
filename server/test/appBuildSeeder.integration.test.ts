/**
 * The startup APK import against a real Postgres. Runs only when TEST_DATABASE_URL is set; it
 * TRUNCATES app_builds, so the database name must contain "test" (see enrollment test).
 */
import { existsSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  FIXTURE_SIGNER_SHA256,
  buildApkBuffer,
  manifestWithOtherPackage,
  manifestWithVersionCode,
  manifestWithVersionName,
  signingBlockWithOtherSigner,
} from "./helpers/buildApk.js";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (TEST_DATABASE_URL && !/test/i.test(new URL(TEST_DATABASE_URL).pathname)) {
  throw new Error("TEST_DATABASE_URL must point at a database whose name contains 'test'");
}

describe.skipIf(!TEST_DATABASE_URL)("seedAppBuilds (Postgres)", () => {
  let pool: typeof import("../src/db/pool.js").pool;
  let seedAppBuilds: typeof import("../src/services/appBuildSeeder.js").seedAppBuilds;
  let appBuilds: typeof import("../src/services/appBuilds.js");
  let seedDir: string;
  let storeDir: string;

  beforeAll(async () => {
    ({ pool } = await import("../src/db/pool.js"));
    ({ seedAppBuilds } = await import("../src/services/appBuildSeeder.js"));
    appBuilds = await import("../src/services/appBuilds.js");
    const { applyMigrations } = await import("../src/db/schema.js");
    await applyMigrations(pool);
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE app_builds");
    seedDir = mkdtempSync(join(tmpdir(), "eud-seed-"));
    storeDir = mkdtempSync(join(tmpdir(), "eud-store-"));
    writeFileSync(join(seedDir, "SIGNER.sha256"), `${FIXTURE_SIGNER_SHA256}  release signing certificate\n`);
  });

  afterAll(async () => {
    await pool?.end();
  });

  const put = (name: string, apk: Buffer) => writeFileSync(join(seedDir, name), apk);
  const seed = () => seedAppBuilds(seedDir, storeDir);

  it("imports the APK, stores it by SHA-256 and makes it current", async () => {
    put("eud-remote-assist.apk", buildApkBuffer());
    const { outcomes, current } = await seed();
    expect(outcomes).toEqual([
      expect.objectContaining({ file: "eud-remote-assist.apk", result: "imported", versionCode: 11 }),
    ]);
    expect(current).toMatchObject({ versionCode: 11, versionName: "3.1.4", signerSha256: FIXTURE_SIGNER_SHA256 });
    expect(existsSync(appBuilds.appBuildFilePath(current!, storeDir))).toBe(true);
    expect(appBuilds.getCurrentAppBuild()?.sha256).toBe(current!.sha256);
  });

  it("is idempotent, and restores a stored file that went missing", async () => {
    put("eud-remote-assist.apk", buildApkBuffer());
    const first = await seed();
    expect((await seed()).outcomes[0].result).toBe("already-imported");
    unlinkSync(appBuilds.appBuildFilePath(first.current!, storeDir));
    const again = await seed();
    expect(again.outcomes[0]).toMatchObject({ result: "already-imported", reason: expect.stringMatching(/restored/) });
    expect(existsSync(appBuilds.appBuildFilePath(first.current!, storeDir))).toBe(true);
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM app_builds");
    expect(rows[0].n).toBe(1);
  });

  it("refuses another app's package", async () => {
    put("other.apk", buildApkBuffer({ manifest: manifestWithOtherPackage() }));
    const { outcomes, current } = await seed();
    expect(outcomes[0]).toMatchObject({ result: "refused", reason: expect.stringMatching(/package/) });
    expect(current).toBeNull();
  });

  it("refuses a build signed by someone other than SIGNER.sha256", async () => {
    put("eud-remote-assist.apk", buildApkBuffer({ signingBlock: signingBlockWithOtherSigner() }));
    const { outcomes } = await seed();
    expect(outcomes[0]).toMatchObject({ result: "refused", reason: expect.stringMatching(/SIGNER\.sha256/) });
  });

  it("without SIGNER.sha256, refuses a signer different from the builds already imported", async () => {
    put("a.apk", buildApkBuffer());
    await seed();
    rmSync(join(seedDir, "SIGNER.sha256"));
    put("b.apk", buildApkBuffer({ manifest: manifestWithVersionCode(12), signingBlock: signingBlockWithOtherSigner() }));
    const { outcomes, current } = await seed();
    expect(outcomes.find((o) => o.file === "b.apk")).toMatchObject({
      result: "refused",
      reason: expect.stringMatching(/imported builds are signed by/),
    });
    expect(current?.versionCode).toBe(11);
  });

  it("refuses a file that is not an APK", async () => {
    writeFileSync(join(seedDir, "broken.apk"), Buffer.alloc(2048, 1));
    expect((await seed()).outcomes[0]).toMatchObject({ result: "refused", reason: expect.stringMatching(/not a readable/) });
  });

  it("skips, loudly, a different file that reuses an imported versionCode", async () => {
    put("a.apk", buildApkBuffer());
    await seed();
    put("b.apk", buildApkBuffer({ manifest: manifestWithVersionName("3.1.5") }));
    const { outcomes, current } = await seed();
    expect(outcomes.find((o) => o.file === "b.apk")).toMatchObject({
      result: "skipped",
      reason: expect.stringMatching(/must raise versionCode/),
    });
    expect(current?.versionName).toBe("3.1.4");
  });

  it("never moves the current build backwards, and moves forward to a higher versionCode", async () => {
    put("new.apk", buildApkBuffer({ manifest: manifestWithVersionCode(20) }));
    await seed();
    put("old.apk", buildApkBuffer());
    const lower = await seed();
    expect(lower.outcomes.find((o) => o.file === "old.apk")).toMatchObject({ result: "skipped", reason: expect.stringMatching(/never moves back/) });
    expect(lower.current?.versionCode).toBe(20);

    put("newer.apk", buildApkBuffer({ manifest: manifestWithVersionCode(21) }));
    expect((await seed()).current?.versionCode).toBe(21);
  });

  it("does nothing without a seed folder", async () => {
    const { outcomes, current } = await seedAppBuilds(join(seedDir, "missing"), storeDir);
    expect(outcomes).toEqual([]);
    expect(current).toBeNull();
  });
});
