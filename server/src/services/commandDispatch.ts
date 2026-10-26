/**
 * Sending commands to devices, and the one place that decides what a command *means* for
 * session state. Every delivery path (WebSocket now, WebSocket on reconnect, HTTP poll,
 * telemetry response) goes through here, so the remote-admin flags and the signaling hint
 * can't drift apart between paths.
 */
import { hub } from "../ws/hub.js";
import type { DeviceCommand } from "../types.js";
import {
  drainCommands,
  formatCommandForDevice,
  queueCommand,
  type CommandDeliveryOptions,
  type DeviceCommandMessage,
} from "./commands.js";
import { setRemoteAdminActive } from "./devices.js";
import { setRemoteSessionActive } from "./signalingSession.js";

export type DeliveryChannel = "websocket" | "http";

const ENDS_REMOTE_SESSION: ReadonlySet<DeviceCommand> = new Set(["STOP_REMOTE_ADMIN", "LOCK_DEVICE"]);

/** Effects of a command that has actually reached the device. */
async function onDelivered(uid: string, command: DeviceCommand): Promise<void> {
  if (command === "START_REMOTE_ADMIN") {
    await setRemoteAdminActive(uid, true);
    setRemoteSessionActive(uid, true);
    if (hub.isDeviceOnline(uid)) {
      hub.sendSignalingHint(uid);
    }
  } else if (ENDS_REMOTE_SESSION.has(command)) {
    await setRemoteAdminActive(uid, false);
    setRemoteSessionActive(uid, false);
  }
}

/**
 * Effects of a command that could only be queued. Ending a session takes effect at once (the
 * admin has left it); a queued START prepares signaling but the device isn't marked
 * remote-active until it actually receives the command.
 */
async function onQueued(uid: string, command: DeviceCommand): Promise<void> {
  if (command === "START_REMOTE_ADMIN") {
    setRemoteSessionActive(uid, true);
  } else if (ENDS_REMOTE_SESSION.has(command)) {
    await setRemoteAdminActive(uid, false);
    setRemoteSessionActive(uid, false);
  }
}

/** Send over the device's WebSocket if it is connected; otherwise queue for its next poll. */
export async function dispatchCommand(
  uid: string,
  command: DeviceCommand,
  options?: CommandDeliveryOptions
): Promise<DeliveryChannel | "queued"> {
  if (hub.sendToDevice(uid, formatCommandForDevice(command, options))) {
    console.log(`Command sent via WebSocket: uid=${uid} command=${command}`);
    await onDelivered(uid, command);
    return "websocket";
  }

  await queueCommand(uid, command, options);
  await onQueued(uid, command);
  return "queued";
}

/**
 * Hand a device its queued (and still fresh) commands. `send` pushes each one over a
 * WebSocket; omit it for HTTP, where the caller puts the returned messages in its response.
 */
export async function deliverQueuedCommands(
  uid: string,
  send?: (message: DeviceCommandMessage) => void
): Promise<DeviceCommandMessage[]> {
  const messages = await drainCommands(uid);
  for (const message of messages) {
    send?.(message);
    await onDelivered(uid, message.command);
  }
  return messages;
}
