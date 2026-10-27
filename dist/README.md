# dist/: the app APK that ships with this release

The console hosts the EUD Remote Assist Android app itself. Nothing is fetched from GitHub at runtime, and no token is needed.

- **`eud-remote-assist.apk`** is the release-signed app that belongs to this portal version. It's committed here, in the same commit and tag as the portal release, so a portal version and its app version always travel together.
- **`SIGNER.sha256`** is the SHA-256 of the release signing certificate. The server refuses any APK in this folder that is signed by anything else.

## How it gets to devices

1. `docker-compose.yml` mounts this folder read-only into the server at `/seed`.
2. On every start, the server imports each APK here into its own store, `data/apk/<sha256>.apk`, which survives updates. It also records the build in the `app_builds` table. The import refuses:
   - another package;
   - another signer;
   - a non-APK.

   It skips, with a log line:
   - a different file that reuses an imported `versionCode` (a new build must raise `versionCode`);
   - a `versionCode` lower than the current build, so the current build never moves back.
3. The current build is the highest `versionCode`. It's served unauthenticated at `GET /api/v1/app/apk`, with its details at `GET /api/v1/app/latest`. Both are under `/api/v1/`, so they pass infra-TAK's Caddy on the device port.
4. Devices whose reported app version is older get an `app_update` offer in the device WebSocket's `auth_ok` and in the command-poll reply. The app shows "Update available" and downloads from the console.

## Releasing a new app version

1. Build the release APK with a **higher `versionCode`**.
2. Verify it: `apksigner verify --print-certs` must show the certificate in `SIGNER.sha256`.
3. Replace `eud-remote-assist.apk`, then commit it with the portal release (`VERSION`, release notes, tag) in one commit.

Android refuses downgrades, so there is no rollback for an installed app. Prove a build on the dev instance first.
