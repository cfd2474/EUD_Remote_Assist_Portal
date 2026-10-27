import { Router } from "express";
import {
  listDevices,
  getDevice,
  getTelemetryHistory,
  getLocationHistory,
  getLocationHistoryFull,
  getDeviceEvents,
  deleteDevice,
} from "../../services/devices.js";
import { hub } from "../../ws/hub.js";
import { commandTtlMs, type CommandDeliveryOptions } from "../../services/commands.js";
import { dispatchCommand } from "../../services/commandDispatch.js";
import { encryptPinForDevice } from "../../services/pinEncryption.js";
import { getSignalingStatus, getSignalingReplay } from "../../services/signalingSession.js";
import { toWebRtcPayload } from "../../services/signalingNormalize.js";
import { reverseGeocode } from "../../services/geocode.js";
import { getIceServers } from "../../services/portalSettings.js";
import { resolveModelDisplays, getModelDisplay } from "../../services/phoneDb.js";
import { config } from "../../config.js";
import type { ControlPacket, DeviceCommand } from "../../types.js";

/** Devices, their history, commands, remote control and signaling diagnostics. */
export const devicesRouter = Router();

const VALID_COMMANDS: readonly DeviceCommand[] = [
  "TRIGGER_PING",
  "REQUEST_LOCATION",
  "START_REMOTE_ADMIN",
  "STOP_REMOTE_ADMIN",
  "LOCK_DEVICE",
  "RESYNC_DEVICE_INFO",
  "REMOTE_UNLOCK",
];

devicesRouter.get("/devices", async (_req, res) => {
  try {
    const devices = await listDevices();
    const sanitized = devices.map((d) => ({
      uid: d.uid,
      serial: d.serial,
      imei: d.imei,
      device_name: d.device_name,
      model: d.model,
      agency: d.agency,
      phone_number: d.phone_number,
      app_version: d.app_version,
      registered_at: d.registered_at,
      last_seen_at: d.last_seen_at,
      last_lat: d.last_lat,
      last_lon: d.last_lon,
      last_location_accuracy_m: d.last_location_accuracy_m,
      last_battery: d.last_battery,
      last_is_charging: d.last_is_charging,
      last_telemetry_at: d.last_telemetry_at,
      is_online: hub.isDeviceOnline(d.uid),
      remote_admin_active: d.remote_admin_active,
    }));
    const modelDisplays = await resolveModelDisplays(
      sanitized.map((device) => device.model)
    );
    res.json({
      devices: sanitized.map((device) => ({
        ...device,
        model_display:
          (device.model && modelDisplays.get(device.model)) ||
          device.model ||
          "—",
      })),
    });
  } catch (err) {
    console.error("List devices error:", err);
    res.status(500).json({ error: "Failed to list devices" });
  }
});

devicesRouter.get("/devices/:uid", async (req, res) => {
  try {
    const device = await getDevice(req.params.uid);
    if (!device) {
      res.status(404).json({ error: "Device not found" });
      return;
    }

    const { connection_secret: _, ...sanitized } = device;
    const model_display = await getModelDisplay(sanitized.model);
    res.json({
      device: {
        ...sanitized,
        is_online: hub.isDeviceOnline(sanitized.uid),
        model_display,
      },
    });
  } catch (err) {
    console.error("Get device error:", err);
    res.status(500).json({ error: "Failed to get device" });
  }
});

devicesRouter.get("/devices/:uid/telemetry", async (req, res) => {
  try {
    const history = await getTelemetryHistory(req.params.uid);
    res.json({ telemetry: history });
  } catch (err) {
    console.error("Telemetry history error:", err);
    res.status(500).json({ error: "Failed to get telemetry history" });
  }
});

/** from_at is the newer bound and to_at the older one (the UI walks back from "now"). */
devicesRouter.get("/devices/:uid/location-history", async (req, res) => {
  const newestRaw = req.query.from_at as string | undefined;
  const oldestRaw = req.query.to_at as string | undefined;

  if (!newestRaw || !oldestRaw) {
    res.status(400).json({ error: "from_at and to_at are required ISO timestamps" });
    return;
  }

  const newestAt = new Date(newestRaw);
  const oldestAt = new Date(oldestRaw);

  if (Number.isNaN(newestAt.getTime()) || Number.isNaN(oldestAt.getTime())) {
    res.status(400).json({ error: "Invalid from_at or to_at" });
    return;
  }

  if (oldestAt.getTime() > newestAt.getTime()) {
    res.status(400).json({ error: "to_at must be on or before from_at" });
    return;
  }

  try {
    const device = await getDevice(req.params.uid);
    if (!device) {
      res.status(404).json({ error: "Device not found" });
      return;
    }

    const fullHistory = req.query.full === "1" || req.query.full === "true";
    const points = fullHistory
      ? await getLocationHistoryFull(req.params.uid, newestAt, oldestAt)
      : await getLocationHistory(req.params.uid, newestAt, oldestAt);
    res.json({ points });
  } catch (err) {
    console.error("Location history error:", err);
    res.status(500).json({ error: "Failed to get location history" });
  }
});

devicesRouter.get("/devices/:uid/events", async (req, res) => {
  try {
    const events = await getDeviceEvents(req.params.uid);
    res.json({ events });
  } catch (err) {
    console.error("Events history error:", err);
    res.status(500).json({ error: "Failed to get events" });
  }
});

devicesRouter.post("/devices/:uid/command", async (req, res) => {
  const command = req.body?.command as DeviceCommand;

  if (!VALID_COMMANDS.includes(command)) {
    res.status(400).json({ error: "Invalid command" });
    return;
  }

  const pin =
    typeof req.body?.pin === "string" ? req.body.pin.trim() : undefined;

  if (command === "REMOTE_UNLOCK") {
    if (!pin) {
      res.status(400).json({ error: "pin is required for REMOTE_UNLOCK" });
      return;
    }
  } else if (pin) {
    res.status(400).json({ error: "pin is only valid for REMOTE_UNLOCK" });
    return;
  }

  try {
    const device = await getDevice(req.params.uid);
    if (!device) {
      res.status(404).json({ error: "Device not found" });
      return;
    }

    let options: CommandDeliveryOptions | undefined;
    if (command === "REMOTE_UNLOCK" && pin) {
      if (!device.public_key) {
        res.status(400).json({ error: "Device has no registered public key for E2EE" });
        return;
      }
      options = { pin: encryptPinForDevice(pin, device.public_key) };
    }

    if (command === "START_REMOTE_ADMIN") {
      // Same list the admin browser gets from /client-config (PLATFORM_REFERENCE §6).
      const iceServers = getIceServers();
      if (iceServers.length > 0) {
        options = { ...options, iceServers };
      }
    }

    const delivery = await dispatchCommand(req.params.uid, command, options);
    if (delivery === "queued") {
      res.json({
        ok: true,
        command,
        delivery: "queued",
        expiresInSeconds: Math.round(commandTtlMs(command) / 1000),
        hint: "Device is not on WebSocket. Command queued for next telemetry or poll.",
      });
      return;
    }

    res.json({ ok: true, command, delivery: "websocket" });
  } catch (err) {
    console.error("Command error:", err);
    res.status(500).json({ error: "Failed to send command" });
  }
});

devicesRouter.get("/devices/:uid/signaling", async (req, res) => {
  try {
    res.json({
      signaling: {
        ...getSignalingStatus(req.params.uid),
        deviceWsConnected: hub.isDeviceOnline(req.params.uid),
      },
    });
  } catch (err) {
    console.error("Signaling status error:", err);
    res.status(500).json({ error: "Failed to get signaling status" });
  }
});

devicesRouter.get("/devices/:uid/signaling/replay", async (req, res) => {
  try {
    const messages = getSignalingReplay(req.params.uid).map(toWebRtcPayload);
    res.json({ messages });
  } catch (err) {
    console.error("Signaling replay error:", err);
    res.status(500).json({ error: "Failed to get signaling replay" });
  }
});

devicesRouter.post("/devices/:uid/control", async (req, res) => {
  const packet = req.body as ControlPacket;

  if (!packet?.action) {
    res.status(400).json({ error: "action is required" });
    return;
  }

  try {
    const sent = hub.sendControl(req.params.uid, packet);
    if (!sent) {
      res.status(409).json({ error: "Device is not connected" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Control error:", err);
    res.status(500).json({ error: "Failed to send control packet" });
  }
});

devicesRouter.delete("/devices/:uid", async (req, res) => {
  try {
    const device = await getDevice(req.params.uid);
    if (!device) {
      res.status(404).json({ error: "Device not found" });
      return;
    }

    hub.disconnectDevice(req.params.uid);
    const removed = await deleteDevice(req.params.uid);
    if (!removed) {
      res.status(404).json({ error: "Device not found" });
      return;
    }

    res.json({ ok: true, uid: req.params.uid });
  } catch (err) {
    console.error("Delete device error:", err);
    res.status(500).json({ error: "Failed to remove device" });
  }
});

devicesRouter.get("/geocode/reverse", async (req, res) => {
  if (!config.geocoder.url) {
    res.status(404).json({ error: "Address lookup is turned off (GEOCODER_URL=none)", disabled: true });
    return;
  }

  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ error: "Invalid lat or lon" });
    return;
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    res.status(400).json({ error: "lat or lon out of range" });
    return;
  }

  try {
    const address = await reverseGeocode(lat, lon);
    if (!address) {
      res.status(502).json({ error: "Reverse geocode failed" });
      return;
    }
    res.json({ address });
  } catch (err) {
    console.error("Reverse geocode error:", err);
    res.status(500).json({ error: "Reverse geocode failed" });
  }
});
