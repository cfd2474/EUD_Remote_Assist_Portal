# EUD Remote Assist Portal — Release Notes

Running changelog for the **portal server and admin UI**. Update this file on every version release. Android app changes are in the [app release notes](app-release-notes.md).

**Format:** Each release is wrapped in `RELEASE_START` / `RELEASE_END` HTML comments with a `version=` attribute, and its heading is `## vX.Y.Z — YYYY-MM-DD`. New entries are added **at the top** (newest first). Automation and the admin portal parse these blocks.

---

<!-- RELEASE_START version=3.2.5 -->
## v3.2.5 — 2026-10-25

**Portal** (no configuration changes)

- **Documentation links point to their new homes.** The Android app's release notes are now published with the portal as [app release notes](app-release-notes.md). The guides no longer carry a personal contact address.
<!-- RELEASE_END version=3.2.5 -->

<!-- RELEASE_START version=3.2.4 -->
## v3.2.4 — 2026-10-25

**Portal** (no configuration changes)

- **Devices no longer drop offline right after connecting.** If a device sent anything in the moment after signing in to the portal (for example its regular keep-alive), the portal could reject the connection. The device then showed as offline until it reconnected on its own, which could take up to 45 seconds. The portal now waits for the sign-in check to finish before handling anything else the device sends.

<!-- RELEASE_END version=3.2.4 -->

<!-- RELEASE_START version=3.2.3 -->
## v3.2.3 — 2026-10-25

**Portal** (maintenance update, no configuration changes)

- **Behind-the-scenes cleanup of the device page and remote view.** Their code is reorganized into smaller parts that are easier to test and maintain. Nothing changes in how the portal looks or works.

<!-- RELEASE_END version=3.2.3 -->

<!-- RELEASE_START version=3.2.2 -->
## v3.2.2 — 2026-10-25

**Portal** (no configuration changes)

- **Remote view no longer sometimes sticks at "Connecting".** When the device became ready while the portal's first connection request was still unanswered, the portal sent a second request, and the two answers got crossed. The portal now waits briefly for the first answer.
- **Leaving the page no longer ends a session that someone else is watching.** The session ends when the last viewer leaves, after about 15 seconds, so reloading the page doesn't cut it off. **Disconnect** still ends it for everyone.
- **The device page reconnects to the portal by itself** after a network drop or server restart, instead of needing a reload.
- **Clearer messages.** Remote-view problems are described in plain terms with what to check. Queued commands say how long they stay valid ("expires after 2 minutes").

<!-- RELEASE_END version=3.2.2 -->

<!-- RELEASE_START version=3.2.1 -->
## v3.2.1 — 2026-10-25

**Portal** (no configuration changes)

- **Queued commands expire.** A command sent while a device is offline is dropped if the device doesn't collect it in time, so it never acts on a stale request. Start remote assist and remote unlock expire after 2 minutes; stop remote assist and ping after 10 minutes; locate after 1 hour; lock and resync after 24 hours. Expired commands are also cleaned from the database daily.
- **Remote-assist status is accurate for offline devices.** A device is shown as in a remote-assist session only once it has received the start command, not as soon as the command was queued.
- **Server maintenance.** Command handling now runs through one code path, and memory used for idle remote-view sessions is released. Operators see no other change.

<!-- RELEASE_END version=3.2.1 -->

<!-- RELEASE_START version=3.2.0 -->
## v3.2.0 — 2026-10-25

**Portal** (no configuration changes required)

- **The TURN server now works for remote view.** Before this release, the TURN server set under Portal Configuration never reached either end of a remote-view session. The admin browser always used a public STUN server, and the device couldn't read the format the portal sent. Both now get the same, correctly formatted list. Remote view should connect in more places, for example when the admin's or device's network blocks direct connections.
- **TURN can be set in the server's `.env`** (`TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`). When it is, Portal Configuration shows it as managed by the environment.
- **Enrollment QR codes use the server's device API URL** (`PUBLIC_BASE_URL`), the same address devices are given when they register. The Server Port setting is retired. Portal Configuration now shows the Device API URL read-only, and warns if a port saved there earlier doesn't match.
- **Outside services can be configured or turned off for closed networks:** STUN, map tiles, device address lookup, and PhoneDB model names. See *External services* in `.env.example`. Map marker icons now ship with the portal instead of loading from the internet.
- **PhoneDB lookups verify TLS by default.** If model names stop resolving on your host, set `PHONEDB_TLS_INSECURE=true`.

<!-- RELEASE_END version=3.2.0 -->

<!-- RELEASE_START version=3.1.7 -->
## v3.1.7 — 2026-10-25

**Portal** (documentation update, no configuration changes)

- **Release notes cover the portal only.** Android app changes, starting with the 3.1.4 MDM override, are now in the [app release notes](app-release-notes.md).
- **Corrected the 3.0.2 entry.** It described a change that was reverted the same day.
- **Install guides updated.**
  - Keep the install folder name and `POSTGRES_PASSWORD` unchanged after the first start; changing either leaves the portal with an empty or unreachable database.
  - Open the TURN port you actually configured (infra-TAK uses 3479) and its UDP relay range.

<!-- RELEASE_END version=3.1.7 -->

<!-- RELEASE_START version=3.1.6 -->
## v3.1.6 — 2026-10-25

**Portal** (maintenance update, no configuration changes)

- **Release notes show dates.** Each version under Documentation → Release Notes now shows the day it was released.
- **Automated checks on every change.** The portal's code is now tested automatically before each release, covering device enrollment, admin sign-in, and remote-view signaling. Nothing changes in how the portal works.

<!-- RELEASE_END version=3.1.6 -->

<!-- RELEASE_START version=3.1.5 -->
## v3.1.5 — 2026-10-25

**Portal** (security update, no configuration changes)

- **Enrollment tokens are counted correctly.** A device that is refused re-enrollment (for example, a wiped phone that was not deleted from the portal first) no longer uses up the token. Several phones scanning the same QR at once can no longer enroll past its use limit.
- **Security fixes in server components.** Closes the request-body crash advisory (body-parser GHSA-27r3-jxmh-p828) and an IP-spoofing advisory that could affect rate limiting (proxy-addr GHSA-jqcg-44mw-7w3h), plus two lower-severity request-parsing issues.
- **Security fixes in the admin web app's build tooling** (Vite, React Router).
- Admin sign-in checks are now shared between the web pages and the live device connection, so both apply exactly the same rules.

<!-- RELEASE_END version=3.1.5 -->

<!-- RELEASE_START version=3.1.3 -->
## v3.1.3 — 2026-07-18

**Portal**

- **UI Updates**: Restructured the App Download page layout to neatly align the QR code to the side, improving readability and aesthetic balance.

<!-- RELEASE_END version=3.1.3 -->

<!-- RELEASE_START version=3.1.2 -->
## v3.1.2 — 2026-07-18

**Portal**

- **Download Page**: Added a QR code to the App Download page to allow easy scanning and downloading of the APK directly to mobile devices.

<!-- RELEASE_END version=3.1.2 -->

<!-- RELEASE_START version=3.1.1 -->
## v3.1.1 — 2026-06-26

**Portal**

- **Enrollment Enhancements**: Implemented multi-use and time-bounded durations for QR tokens.
- **UI Updates**: Separated "MDM Token" and "QR Token" views, added intelligent Expiration and Status columns to the active tokens table, and streamlined token rendering based on type.

<!-- RELEASE_END version=3.1.1 -->

<!-- RELEASE_START version=3.1.0 -->
## v3.1.0 — 2026-06-26

**Portal & App**

- **Constrained Network Detection**: Added intelligent detection for bandwidth-limited environments (e.g., satellite links). Screen capture dynamically scales down resolution and FPS to preserve bandwidth.
- **WebRTC Network Blocking**: WebRTC screen streaming is automatically prevented when a constrained network is detected. The portal now displays a "WebRTC Unavailable" modal to operators, while keeping location and lock commands fully functional.
- **Security Updates**: Applied underlying security enhancements to the application and infrastructure.
- **Custom TURN Server Configuration**: Added support for configuring a custom Coturn TURN server with explicit fingerprinting and listening IP.

<!-- RELEASE_END version=3.1.0 -->

<!-- RELEASE_START version=3.0.2 -->
## v3.0.2 — 2026-06-21

**Portal**

- Explicitly defined the Docker Compose project name to prevent accidental database wiping when the repository folder is renamed.
- **Correction:** this change was reverted the same day, before 3.1.0. Docker Compose names the database volume after the project, so pinning the name would have pointed existing installs whose folder had a different name at a new, empty database. The project name again comes from the install folder, so keep that folder name stable.

<!-- RELEASE_END version=3.0.2 -->

<!-- RELEASE_START version=3.0.1 -->
## v3.0.1 — 2026-06-21

**Portal**

- WebRTC UI: Replaced video element with "Stream Failed" placeholder when WebRTC stream fails to establish.
- WebRTC UI: Removed "Retry WebRTC" button when stream is connecting or already active to prevent accidental resets.

<!-- RELEASE_END version=3.0.1 -->

<!-- RELEASE_START version=3.0.0 -->
## v3.0.0 — 2026-06-21

**Portal & App**

- **Compatibility**: The v3.0.0 portal requires the EUD Remote Assist App v3.0.0 to function properly due to the underlying security and naming changes. Older app versions will fail to connect.
- Re-branded and completely renamed the project from CFD Remote Assist to EUD Remote Assist.
- Migrated all infrastructure configurations, docker container namespaces, database identifiers, documentation, and internal code names to the new `eud-remote-assist` standard.
- **QR Code Registration**: Introduced a streamlined enrollment flow allowing new devices to register simply by scanning a dynamically generated QR code directly from the portal UI.
- **Token Security**: Overhauled authentication by introducing secure, short-lived enrollment tokens and encrypted API tokens for persistent device authorization.
- **Security Enhancements**: Implemented stricter API endpoint validation, HMAC verification for critical payloads, and fortified the device gateway service against unauthorized connection attempts.

<!-- RELEASE_END version=3.0.0 -->

<!-- RELEASE_START version=2.2.26 -->
## v2.2.26 — 2026-06-17

**Portal**

- Fix APK version parsing fallback logic to correctly identify target application versions from Github repository assets.

<!-- RELEASE_END version=2.2.26 -->

<!-- RELEASE_START version=2.2.25 -->
## v2.2.25 — 2026-06-17

**Portal**

- Added **Export Device List** link at the bottom of the Devices page. Admins can select specific columns (UID, Name, Model, Phone number, App version, Agency, Last location coordinate, Last location seen date/time) to include in the exported CSV.
- The exported CSV file is named `EUD_export_<date/time>.csv`.
- Display the device name at the top of the data elements list in the individual device info panel.

<!-- RELEASE_END version=2.2.25 -->

<!-- RELEASE_START version=2.2.24 -->
## v2.2.24 — 2026-06-17

**Portal**

- Disabled browser autocomplete/autofill on the PIN input field in the remote unlock modal to prevent automated browser values from overriding or interfering with PIN entries.

<!-- RELEASE_END version=2.2.24 -->

<!-- RELEASE_START version=2.2.23 -->
## v2.2.23 — 2026-06-17

**Portal**

- Optimized remote unlock user experience (UX) flow and transitions.

<!-- RELEASE_END version=2.2.23 -->

<!-- RELEASE_START version=2.2.22 -->
## v2.2.22 — 2026-06-17

**Portal**

- Modified lock device modal wording and verification constraints to match the new operational specifications.

<!-- RELEASE_END version=2.2.22 -->

<!-- RELEASE_START version=2.2.21 -->
## v2.2.21 — 2026-06-17

**Portal**

- Implemented a WebRTC inactivity warning modal that automatically terminates active streaming sessions upon navigation, tab unload, or idle timeout.

<!-- RELEASE_END version=2.2.21 -->

<!-- RELEASE_START version=2.2.20 -->
## v2.2.20 — 2026-06-16

**Portal**

- Optimized WebRTC connection signaling handshake offer delay and video capture warmup delay on the device to minimize connection latency.

<!-- RELEASE_END version=2.2.20 -->

<!-- RELEASE_START version=2.2.19 -->
## v2.2.19 — 2026-06-16

**Portal**

- Fixed video panel size logic for device rotation state and added renegotiation guard rules.

<!-- RELEASE_END version=2.2.19 -->

<!-- RELEASE_START version=2.2.18 -->
## v2.2.18 — 2026-06-16

**Portal**

- Request inbound keyframes on every `ORIENTATION_CHANGED` layout event to ensure rapid recovery.

<!-- RELEASE_END version=2.2.18 -->

<!-- RELEASE_START version=2.2.17 -->
## v2.2.17 — 2026-06-16

**Portal**

- After applying a device-initiated renegotiation offer (rotation recovery or PeerConnection restart), re-attach the video element and schedule stream recovery so the viewer resumes when ICE restarts.

<!-- RELEASE_END version=2.2.17 -->

<!-- RELEASE_START version=2.2.16 -->
## v2.2.16 — 2026-06-16

**Portal**

- Accept device-initiated WebRTC offers during an active stream (rotation renegotiation): answer with a new SDP answer instead of ignoring offers when `signalingState` is stable.
- HTTP signaling replay also applies renegotiation offers when the stream is already active.

<!-- RELEASE_END version=2.2.16 -->

<!-- RELEASE_START version=2.2.15 -->
## v2.2.15 — 2026-06-16

**Portal**

- Reduce black screen on rotation when `ORIENTATION_CHANGED` arrives before landscape RTP decodes: panel aspect ratio now follows decoded video until `video.videoWidth/Height` updates (reintroduces v2.2.13 `mergeStreamDimensions` behavior).
- Request an inbound keyframe when layout hints (`ORIENTATION_CHANGED` / `CAPTURE_RESIZED`) change during an active stream.

<!-- RELEASE_END version=2.2.15 -->

<!-- RELEASE_START version=2.2.14 -->
## v2.2.14 — 2026-06-16

**Portal**

- Revert WebRTC viewer connection setup to the v2.2.6 behavior (`useWebRtcViewer`, `RemoteViewer`, `streamDimensions`). Removes 2.2.12–2.2.13 changes: RTP-stats media verification, 90s media deadline, H.264 codec preference, rotation keyframe requests, and hint-vs-frame dimension merge logic.

<!-- RELEASE_END version=2.2.14 -->

<!-- RELEASE_START version=2.2.13 -->
## v2.2.13 — 2026-06-15

**Portal**

- Fix black screen on device rotation: panel aspect ratio now follows the actual decoded video frame instead of flipping early on `ORIENTATION_CHANGED` hints.
- Request a keyframe when orientation/size hints change so the browser recovers quickly after capture resize.

**Documentation**

- Expanded the Android app integration requirements with full WebRTC diagnosis, control handling, and rotation requirements for the app team.
- Corrected the Android WebRTC troubleshooting notes based on `chrome://webrtc-internals` evidence.

<!-- RELEASE_END version=2.2.13 -->

<!-- RELEASE_START version=2.2.12 -->
## v2.2.12 — 2026-06-15

**Portal**

- Fix indefinite "establishing video stream" state: media timeouts now verify inbound RTP, not just track objects; 90s hard deadline after answer; frame-wait timer no longer resets on duplicate attach.
- H.264 added to WebRTC codec preferences alongside VP8/VP9.

**Documentation**

- Updated the Android WebRTC requirements for Android team review (connection_secret, ICE, track ordering, HTTP fallback, stuck-connecting symptoms).

<!-- RELEASE_END version=2.2.12 -->

<!-- RELEASE_START version=2.2.11 -->
## v2.2.11 — 2026-06-15

**Portal**

- Stop sending duplicate WebRTC offers after the device SDP answer is received (fixes stalled remote assist and unexpected `REMOTE_SESSION_STOPPED` on device).
- Retry WebRTC button now forces a clean renegotiation when a session has failed.

<!-- RELEASE_END version=2.2.11 -->

<!-- RELEASE_START version=2.2.10 -->
## v2.2.10 — 2026-06-15

**Server**

- WebRTC offers and ICE relayed to devices now include `connection_secret`, matching command auth and fixing Android "Secret mismatch" rejections during remote assist.

<!-- RELEASE_END version=2.2.10 -->

<!-- RELEASE_START version=2.2.9 -->
## v2.2.9 — 2026-06-15

**Portal**

- **Portal Configuration** — optional GitHub classic `public_repo` token with Apply/Remove (no restart required).
- Default APK lookup remains standard unauthenticated GitHub access; token enables unthrottled repo access.
- Token persisted in `data/portal-settings.json` via Docker volume mount.

**Documentation**

- Added [github-apk-config.md](github-apk-config.md) for GitHub APK lookup and token setup.

<!-- RELEASE_END version=2.2.9 -->

<!-- RELEASE_START version=2.2.8 -->
## v2.2.8 — 2026-06-15

**Portal**

- Footer now shows **Admin Portal version** with the installed release number.
- Added **Portal Configuration** nav link and placeholder page for upcoming advanced settings.

<!-- RELEASE_END version=2.2.8 -->

<!-- RELEASE_START version=2.2.7 -->
## v2.2.7 — 2026-06-15

**Portal**

- Added a centered site footer with TAK-Solutions attribution, open-source license link, and installed portal version.
- Documentation index links to the GitHub repository at the bottom of the page.

<!-- RELEASE_END version=2.2.7 -->

<!-- RELEASE_START version=2.2.6 -->
## v2.2.6 — 2026-06-15

**Portal**

- Added **Export all history** on the device location history page.
- Downloads a CSV of every stored location record (unsampled), filename includes device name and UID.

**API**

- Location history endpoint supports `?full=1` for complete export data (map/table still use sampled points).

<!-- RELEASE_END version=2.2.6 -->

<!-- RELEASE_START version=2.2.5 -->
## v2.2.5 — 2026-06-15

**Portal**

- Device detail pages compare installed app version against the current APK release.
- Shows a yellow **Newer application version available** banner when the published APK is newer.

<!-- RELEASE_END version=2.2.5 -->

<!-- RELEASE_START version=2.2.4 -->
## v2.2.4 — 2026-06-15

**Portal**

- Added row checkboxes and **select all** on the Managed Devices list.
- Added bulk **Remove Device & Clear Data** with the same confirmation modal as single-device removal.

<!-- RELEASE_END version=2.2.4 -->

<!-- RELEASE_START version=2.2.3 -->
## v2.2.3 — 2026-06-15

**Portal**

- Added **Release Notes** under Documentation with a per-version index.
- Release notes are parsed from this file (`docs/RELEASE_NOTES.md`) and rendered in the portal with site styling.
- Each version has its own page; guide-style **Open in New Tab** is available on version detail pages.

**Documentation**

- Introduced `docs/RELEASE_NOTES.md` as the running release changelog (maintain on every version bump).

<!-- RELEASE_END version=2.2.3 -->

<!-- RELEASE_START version=2.2.2 -->
## v2.2.2 — 2026-06-14

**Portal**

- Render user guides as in-portal markdown pages (no external GitHub links).
- Added **Managed Devices** subheader link (left); moved **Documentation** and **Download** to the right.
- Guide list opens in the same tab; added **Open in New Tab** on each guide page.

**Documentation**

- Updated app deployment guide for MDM-preferred and manual APK install flows.
- Removed vendor-specific MDM product references from docs.

<!-- RELEASE_END version=2.2.2 -->

<!-- RELEASE_START version=2.2.1 -->
## v2.2.1 — 2026-06-14

**Documentation**

- Patch release for deployment guide and admin guide content updates.
- Deployment guide: MDM preferred, manual APK path, basic vs special permissions, simplified registration flow (no `connection_secret` in user-facing steps).

<!-- RELEASE_END version=2.2.1 -->

<!-- RELEASE_START version=2.2.0 -->
## v2.2.0 — 2026-06-14

**Portal**

- Added **Documentation** page and subheader link.
- Published administrator and app deployment user guides in the repo.

**Documentation**

- Added `eud-remote-assist-portal-admin-guide.md` and `eud-remote-assist-app-deployment-guide.md`.

<!-- RELEASE_END version=2.2.0 -->

<!-- RELEASE_START version=2.1.1 -->
## v2.1.1 — 2026-06-14

**Operations**

- Patch release to validate downstream version checking (`VERSION` file vs `GET /version` on port 8448).

<!-- RELEASE_END version=2.1.1 -->

<!-- RELEASE_START version=2.1.0 -->
## v2.1.0 — 2026-06-14

**Deployment**

- **infra-TAK integration profile:** `NGINX_BIND_ADDR` and `HTTP_PORT` in `docker-compose.yml` (no compose file patching).
- Removed unused inner Docker HTTPS port mapping; external TLS (Caddy/host nginx) terminates TLS.
- Added `docs/infratak-integration.md`.
- `.gitignore` includes `docker-compose.override.yml`.

<!-- RELEASE_END version=2.1.0 -->

<!-- RELEASE_START version=2.0.0 -->
## v2.0.0 — 2026-06-14

**Device API**

- Android device traffic moved to port **8448** (avoids conflict with TAK Server admin on 8443).
- Admin portal remains on **443**; device routes blocked on 443 in production nginx profile.

**Versioning**

- Root `VERSION` file, `GET /version`, and `version` field on `GET /health` (port 8448).
- Git tags `vX.Y.Z` matching `VERSION`.

**Documentation**

- Android device API port 8448 handoff for app team.
- Host nginx examples for admin-only 443 and device API 8448.

<!-- RELEASE_END version=2.0.0 -->
