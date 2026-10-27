# App hosting: the console serves the EUD Remote Assist APK

Since portal 3.3.0, the console hosts the Android app itself. Neither the server nor devices contact GitHub for the APK, and no GitHub token is needed.

## How it works

- **One app version per portal release.** The release-signed APK is committed at `dist/eud-remote-assist.apk`, in the same commit and tag as the portal release. `dist/README.md` explains the release steps.
- **Imported at startup.** Compose mounts `./dist` read-only at `/seed`. On every start the server imports the APK into `data/apk/<sha256>.apk`, which survives updates, and records it in the `app_builds` table. An APK is refused if:
  - it's another package;
  - it's signed by a certificate other than `dist/SIGNER.sha256`;
  - it isn't an APK.

  It's skipped, with a log line, if:
  - it reuses a versionCode that's already imported;
  - its versionCode is lower than the current build's.
- **Served to devices, unauthenticated:**
  - `GET /api/v1/app/apk` returns the APK, with `Content-Type: application/vnd.android.package-archive` and its SHA-256 in `ETag` and `X-Content-SHA256`;
  - `GET /api/v1/app/latest` returns `{versionCode, versionName, url, sha256, size}`.

  Both paths sit under `/api/v1/`, which infra-TAK's Caddy forwards on the device port (8448).
- **Update offers.** A device whose reported app version is older gets `app_update` (the same fields as `/app/latest`) in the device WebSocket's `auth_ok` and in the `GET /api/v1/commands` reply. The app (3.3.0+) shows "Update available" and downloads from the console. Android then asks the user to install it.
- **In the admin UI:**
  - **Portal Configuration → App build** shows the hosted version, versionCode, file and signer SHA-256, and when it was imported;
  - **Download** links and its QR code use `PUBLIC_BASE_URL/api/v1/app/apk`;
  - a device page shows "Newer application version available" when the device is behind the hosted build.

## Checking it on a server

```bash
docker compose logs server | grep "App builds"     # one line per APK, then "current X (versionCode N …)"
curl -s https://<device-host>:8448/api/v1/app/latest
```

## Upgrading from 3.2.x

- `GITHUB_APK_REPO` and `GITHUB_TOKEN` are no longer read. They can stay in `.env`, where they are harmless.
- A GitHub token saved in Portal Configuration is removed from `data/portal-settings.json` at the first start.
- GitHub releases (`eud_X.Y.Z`) are still published, for portals older than 3.3.0 and for infra-TAK.
  - **infra-TAK follows the newest published release** (from infra-TAK PR #303). It checks that `VERSION` at the release's tag matches the release name and skips the release otherwise.
  - So each `eud_X.Y.Z` must be created **on the public release commit** for `vX.Y.Z`, never on `main` by default:
    ```
    gh release create eud_X.Y.Z <apk> -R cfd2474/EUD_Remote_Assist_Portal --target <public vX.Y.Z commit> …
    ```
  - Since 3.3.0, the app and portal versions match, so `eud_X.Y.Z` and `vX.Y.Z` name the same release.
