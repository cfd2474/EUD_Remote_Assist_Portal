/**
 * Admin token verification against real signed JWTs: a throwaway key pair is served
 * from a local JWKS endpoint, so jose's actual verification path runs.
 */
import { generateKeyPair, type KeyLike } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestIssuer } from "./helpers/testIssuer.js";

const issuer = new TestIssuer();
let otherKey: KeyLike;
let verifyAdminToken: typeof import("../src/auth/oidc.js").verifyAdminToken;

beforeAll(async () => {
  await issuer.start();
  otherKey = (await generateKeyPair("RS256")).privateKey;
  // config.ts reads the JWKS URI at import, so set it before importing the module.
  process.env.OIDC_JWKS_URI = issuer.jwksUri;
  ({ verifyAdminToken } = await import("../src/auth/oidc.js"));
});

afterAll(() => issuer.stop());

describe("verifyAdminToken", () => {
  it("accepts a member of the admin group", async () => {
    const result = await verifyAdminToken(await issuer.adminToken());
    expect(result.ok).toBe(true);
  });

  it("accepts an allow-listed email, case-insensitively", async () => {
    const result = await verifyAdminToken(await issuer.sign({ email: "boss@EXAMPLE.test" }));
    expect(result.ok).toBe(true);
  });

  it("forbids a valid user who is neither listed nor in the group", async () => {
    const result = await verifyAdminToken(await issuer.sign({ email: "user@example.test", groups: ["staff"] }));
    expect(result).toMatchObject({ ok: false, reason: "forbidden" });
  });

  it("forbids when groups is not an array", async () => {
    const result = await verifyAdminToken(await issuer.sign({ email: "user@example.test", groups: "eud-admins" }));
    expect(result).toMatchObject({ ok: false, reason: "forbidden" });
  });

  it.each([
    ["signed by another key", () => ({ key: otherKey })],
    ["from another issuer", () => ({ issuer: "https://evil.test/" })],
    ["for another audience", () => ({ audience: "other-client" })],
    ["expired", () => ({ expiresIn: "-1m" })],
  ])("rejects an admin-group token %s as invalid", async (_label, opts) => {
    const jwt = await issuer.sign({ groups: ["eud-admins"] }, opts());
    expect(await verifyAdminToken(jwt)).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("rejects garbage as invalid", async () => {
    expect(await verifyAdminToken("not-a-jwt")).toMatchObject({ ok: false, reason: "invalid" });
  });
});
