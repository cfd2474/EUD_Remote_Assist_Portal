# Versioning

The EUD Remote Assist Portal has one release version: the repo-root **`VERSION`** file. Install automation and operators read it from git or from the running API.

infra-TAK and other orchestrators: see [infratak-integration.md](infratak-integration.md).

## Source of truth

| Location | Format | Kept in step by |
|----------|--------|-----------------|
| `VERSION` (repo root) | `X.Y.Z`, one line | The release commit |
| `server/package.json`, `web/package.json` | `"version": "X.Y.Z"` | The release commit (CI checks) |
| Git tag | Annotated `vX.Y.Z` on the release commit | CI checks that the newest tag equals `VERSION` |
| Release notes | A block in `docs/RELEASE_NOTES.md` (also shown in the admin portal) | CI checks that the newest block equals `VERSION` |
| Running server | `GET /version` or `GET /health` | The deploy |

The Android app has its own version and its own [release notes](app-release-notes.md). A device's `app_version` is the APK version, not the portal release.

## Which number to bump

- **Patch** (`3.1.6` → `3.1.7`): fixes, refactors, docs that ship, dependency updates.
- **Minor** (`3.1.x` → `3.2.0`): a new capability an operator would notice.
- **Major**: only when the project owner says so.
- **No bump**: changes that don't alter what ships (tests, CI, repo-only docs).

Versions only move forward. Never re-use or go back to a number that has been on `main`. Installs compare versions and treat an older or equal number as "nothing to do".

## Cutting a release

1. Bump `VERSION`, both `package.json` files, and the `"version"` fields in both `package-lock.json` files.
2. Add a block at the **top** of `docs/RELEASE_NOTES.md`, written for operators:

   ```markdown
   <!-- RELEASE_START version=3.1.7 -->
   ## v3.1.7 — 2026-10-25

   **Portal**

   - What changed, in the operator's terms.

   <!-- RELEASE_END version=3.1.7 -->
   ```

   The `RELEASE_START`/`RELEASE_END` markers are what the admin portal parses. The heading must be `## vX.Y.Z — YYYY-MM-DD`.
3. Commit, then tag that commit:

   ```bash
   git tag -a v3.1.7 -m "v3.1.7 — <what changed>"
   git rev-parse 'v3.1.7^{}'   # the commit the tag points at (plain rev-parse gives the tag object)
   ```

4. Push the branch and the tag **together**. CI fails if a pushed `VERSION` has no matching tag:

   ```bash
   git push --atomic origin dev v3.1.7
   ```

Releases go to `dev` first. Promote to `main` deliberately: infra-TAK boxes follow `main` and see every push to it as an update.

## Check version from a git checkout

```bash
cat VERSION
./scripts/version.sh   # same value
```

After an update, compare the checkout to what is running:

```bash
EXPECTED=$(cat VERSION)
RUNNING=$(curl -sS https://remote.example.com:8448/version | jq -r .version)
test "$EXPECTED" = "$RUNNING" && echo "OK: $RUNNING" || echo "MISMATCH: want $EXPECTED, got $RUNNING"
```

## HTTP endpoints

Both are served on the **device API port (8448)** in production and need no authentication.

`GET /version`:

```json
{ "version": "3.1.7", "service": "eud-remote-assist-portal" }
```

`GET /health`:

```json
{ "status": "ok", "service": "eud-remote-assist-portal", "version": "3.1.7" }
```

On the server host (loopback to Docker nginx; use your `HTTP_PORT`):

```bash
curl -sS http://127.0.0.1:8091/version
```

## Install / update workflow

1. Clone or update the repo.
2. Read `VERSION` to confirm the expected release.
3. Run `docker compose up -d --build`.
4. Call `/version` and confirm it matches `VERSION`.

See [manual-install.md](manual-install.md) for full server setup.
