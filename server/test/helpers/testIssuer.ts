/**
 * A throwaway OIDC issuer for tests: an RS256 key pair, a local JWKS endpoint, and a token
 * signer. Call start() and point OIDC_JWKS_URI at jwksUri *before* importing auth/oidc.ts,
 * because config.ts reads the URI at import.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from "jose";

export const ISSUER = "https://issuer.test/application/o/eud-test/";
export const AUDIENCE = "eud-test-client";

export interface TokenOptions {
  key?: KeyLike;
  issuer?: string;
  audience?: string;
  expiresIn?: string;
}

export class TestIssuer {
  private server?: http.Server;
  private signingKey?: KeyLike;
  jwksUri = "";

  async start(): Promise<void> {
    const pair = await generateKeyPair("RS256");
    this.signingKey = pair.privateKey;
    const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "test-key", alg: "RS256", use: "sig" };

    this.server = http.createServer((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
    const { port } = this.server.address() as AddressInfo;
    this.jwksUri = `http://127.0.0.1:${port}/jwks/`;
  }

  stop(): void {
    this.server?.close();
  }

  sign(claims: Record<string, unknown>, opts: TokenOptions = {}): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(opts.issuer ?? ISSUER)
      .setAudience(opts.audience ?? AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(opts.expiresIn ?? "5m")
      .sign(opts.key ?? this.signingKey!);
  }

  /** A token for a member of the admin group configured in vitest.config.ts. */
  adminToken(): Promise<string> {
    return this.sign({ email: "ops@example.test", groups: ["eud-admins"] });
  }
}
