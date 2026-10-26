# EUD Remote Assist Portal — Administrator Guide

**Release 3.2.5**

The Remote Assist Portal is the web console for managing your fleet of company-owned Android devices. From a single browser you can see where every device is, confirm it's online, push a ping or location request, and take live control of the screen for hands-on support.

---

## 1. What the portal does

| Capability | Description |
|---|---|
| Enrollment | Generate MDM JSON config blobs or scannable QR tokens to enroll devices securely. |
| Device registry | Every enrolled device appears in one list with status, last check-in, model, and phone number. |
| Location tracking | Devices report location and battery on a set interval (default 15 min). |
| Ping | Make a device alert the user so they can locate it or confirm it's in hand. |
| Locate on demand | Force an immediate location report outside the normal interval. |
| Remote Assist | View the device screen live and drive it with remote touch (WebRTC). |
| Remove device | Delete a device and all of its data from the server. |

---

## 2. Enrollment & Tokens

The **Enrollment** page is where you generate secure tokens to onboard new devices.

- **QR Tokens**: Best for manual installs. Set an expiration limit (e.g., "Single Use" or "10 minutes") and a QR code will be generated. The device user simply scans this code from the app to register.
- **MDM Tokens**: Best for automated fleet rollouts. Generates a permanent JSON configuration block that you can copy directly into your MDM platform's managed app restrictions.

The active tokens table displays the remaining uses or time for each token. Once a token is fully consumed or expires, it is automatically marked inactive and can be safely removed. You can also manually revoke a token at any time.

QR codes and MDM configs point devices at the **Device API URL** shown under **Portal Configuration**. That URL comes from the server's settings. If it isn't set, the portal shows a message instead of a QR code.

### Portal Configuration

- **GitHub APK access**: an optional token for faster, unthrottled APK version checks.
- **Device API URL**: where devices enroll and connect. It's read-only here; your server administrator sets it (`PUBLIC_BASE_URL`). A warning appears if a port saved on this page by an older version doesn't match it.
- **TURN Server**: relays remote-view video when the device and your browser can't reach each other directly. Both your browser and the device use it. If the server administrator has set it in the server's settings, it shows as configured there and can't be edited on this page.

---

## 3. Signing in

The portal is protected by **single sign-on (OIDC / Authentik)**.

1. Open the portal URL in a browser (e.g. `https://<FQDN>`).
2. You'll be redirected to the Authentik login page.
3. Enter your admin credentials.
4. After login you land on the **Devices** list.

> Only accounts authorized in Authentik can reach the portal. Device APIs use a separate per-device identity and never log in here.

See [authentik-setup.md](authentik-setup.md) for identity provider configuration.

---

## 4. The Devices list

The landing page shows every registered device. For each one you'll typically see:

- **Device name** (e.g. `Tech-Support-Tablet-01`)
- **Status** — online / offline based on the last check-in
- **Last seen** — timestamp of the most recent telemetry
- **Battery** and **location** from the last pulse
- **Model** and **phone number**

Click any row to open the **Device detail** view.

At the bottom of the page, there is an **Export Device List** link. Clicking this link opens a modal where you can customize the CSV export by checking or unchecking specific values. Tapping **Export** downloads a CSV file with the naming convention `EUD_export_<date/time>.csv`.

---

## 5. Device detail & actions

The detail view is where you act on a single device. It displays device-specific telemetry and offers administrative action buttons.

### Device Info Panel
The device info list displays specific metadata elements. The **Device Name** is shown at the top of the data elements list, followed by other telemetry points such as the current location details, battery level, etc.

### Available Actions:

### Ping
Sends `TRIGGER_PING`. The device alerts so the user (or you, if it's nearby) can find it. The device replies with a `PING_ACKNOWLEDGED` event once the user responds.

### Locate
Sends `REQUEST_LOCATION` for an immediate position fix rather than waiting for the next scheduled pulse. Useful when a device just moved or hasn't checked in recently.

### Remote Assist (screen view + control)
1. Click **Connect**. This sends `START_REMOTE_ADMIN`.
2. The device begins streaming its screen to your browser over WebRTC. If a constrained network is detected, it will dynamically adjust or prevent WebRTC.
3. Click or tap on the streamed image to drive the device — each interaction is sent as a touch packet (`CLICK` with x/y as a percentage of the screen, so it works across any resolution).
4. Click **Disconnect** (`STOP_REMOTE_ADMIN`) when finished. This ends the session for everyone watching the device. Always disconnect when you're done, so the device isn't left in a controllable state.

**Several admins can watch the same session.** Closing your tab or navigating away doesn't end it for the others. When the **last** viewer leaves, the portal ends the session automatically after about 15 seconds. Reloading the page within that time keeps the session. If your connection to the portal drops, the page reconnects on its own.

### Remove device
Deletes the device record and **all associated data** from the server. This does not wipe the device — it only removes it from the portal. The device would need to re-register to reappear.

---

## 6. Understanding delivery: instant vs. queued

Commands reach devices two ways:

- **Instant (WebSocket):** When a device holds an open `wss://.../ws/device` connection, ping/locate/remote-assist commands fire immediately. This is the normal, expected state.
- **Queued (fallback):** If the WebSocket is down, commands are held and delivered on the device's next telemetry POST or command poll — so they may lag by up to one tracking interval.

Queued commands **expire** if the device doesn't collect them in time, so a device that comes back late never acts on a stale request:

| Command | Expires after |
|---|---|
| Start remote assist, remote unlock | 2 minutes |
| Stop remote assist, ping | 10 minutes |
| Locate | 1 hour |
| Lock, resync device info | 24 hours |

An expired command is dropped without running. Send it again once the device is back online. A device isn't shown as being in a remote-assist session until it has actually received the start command.

If an action seems slow or unresponsive, the most common cause is that the device's WebSocket isn't connected (poor signal, app backgrounded/killed, or network blocking `wss`).

---

## 7. Quick troubleshooting

| Symptom | Likely cause | Check |
|---|---|---|
| Device shows offline | No recent check-in | Device powered off, no network, or app not running. |
| Ping/Locate slow | WebSocket not connected | Command is queued; will arrive on next pulse. Confirm device has data/Wi-Fi. |
| Remote Assist won't start | Accessibility/screen-capture not granted on device | See the [App Deployment Guide](eud-remote-assist-app-deployment-guide.md) — accessibility service and media-projection permission must be active. |
| Device missing from list | Never registered or was removed | Confirm MDM pushed the app and managed config; re-register if needed. |
| Can't reach portal | OIDC/login issue | Confirm your Authentik account is authorized; check with your identity admin. |

---

## 8. Privacy & operational notes

- Remote Assist gives full live view and control of the device. Use it only for legitimate support, and stop the session when done.
- All admin access is tied to a named Authentik identity — actions are attributable.
- Removing a device deletes its server-side history; export anything you need first.

---

*EUD Remote Assist Portal · TAK-Solutions*
