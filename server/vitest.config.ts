import { defineConfig } from "vitest/config";

// config.ts reads these at import. Unit tests never connect to the database; the
// enrollment integration test uses TEST_DATABASE_URL and is skipped without it.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Database tests share TEST_DATABASE_URL and truncate tables; run files one at a time.
    fileParallelism: false,
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@127.0.0.1:1/unused",
      OIDC_ISSUER: "https://issuer.test/application/o/eud-test/",
      OIDC_AUDIENCE: "eud-test-client",
      OIDC_JWKS_URI: "http://127.0.0.1:1/jwks/",
      OIDC_ADMIN_GROUP: "eud-admins",
      OIDC_ADMIN_EMAILS: "Boss@Example.test",
    },
  },
});
