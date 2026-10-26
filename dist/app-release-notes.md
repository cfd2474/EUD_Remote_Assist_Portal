# EUD Remote Assist App — Release Notes

Changelog for the **Android app** (`EUD Remote Assist` APK). Newest first.

The admin portal and server keep their own notes in
[`cfd2474/EUD_Remote_Assist_Portal` → `docs/RELEASE_NOTES.md`](https://github.com/cfd2474/EUD_Remote_Assist_Portal/blob/main/docs/RELEASE_NOTES.md).
APKs are published as [GitHub Releases on the portal repo](https://github.com/cfd2474/EUD_Remote_Assist_Portal/releases) (tags `eud_X.Y.Z`).
Notes for app versions before 3.1.4 are in those releases, and in the portal notes from the time.

---

## v3.3.0 — 2026-10-26

- **The app tells you when your console has a newer version.** When the EUD Remote Assist console (portal 3.3.0 or later) hosts a newer build, the app shows **Update available** with a **Download update** button. The download comes from your own console, not the internet. Android then asks you to install it. Devices managed by MDM can keep updating through MDM as before.

## v3.2.1 — 2026-10-25

- **The device registers as soon as its setup is complete.** If the app was opened before every permission was granted (for example, Remote Control was turned on afterwards in Settings), it used to stay "Not Registered" until someone tapped Refresh Connection. It now registers by itself when you return to the app with everything granted.

## v3.2.0 — 2026-10-25

**Requires Android 11 or later.** Devices on Android 8–10 can no longer install or update the app.

- **Remote assist starts on its own on Android 14 and later.** Android 14 hid the "Start now" button of the screen-recording prompt from the app, so a remote-assist session stopped at that prompt until someone on the device tapped it. The app can now accept it as intended on managed devices. Tested on the Android 11–16 emulators.
- **The correct app version is reported to the portal.** The app had been reporting itself as 2.0.8 regardless of its real version, which made the portal show "Newer application version available".
- **Screens fit Android 15 and 16.** Content no longer slides under the status bar, and the status and navigation bar icons stay readable.
- **Fewer permissions.** Storage and photo/video/audio access were removed; the app never used them.
- The camera and phone hardware are now optional, so tablets without them aren't excluded.

**Good to know:** if someone uses Android's **Force stop** on this app, Android also turns off its Remote Control (accessibility) setting. Turn it back on in the app's Permission Controls before the next remote session.

## v3.1.4 — 2026-07-20

- **MDM Override**: Added the ability to instantly bypass the MDM configuration during "Scan to Enroll" if the correct MDM settings password is provided.
