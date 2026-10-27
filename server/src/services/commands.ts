import { pool } from "../db/pool.js";
import type { DeviceCommand } from "../types.js";
import type { IceServer } from "./iceServers.js";

export interface DeviceCommandMessage {
  type: "command";
  command: DeviceCommand;
  pin?: string;
  iceServers?: IceServer[];
}

export interface CommandDeliveryOptions {
  pin?: string;
  iceServers?: IceServer[];
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * How long a queued command stays deliverable (D7). Counted from when it was queued, and
 * applied at delivery, so a device that comes back late never acts on a stale request.
 */
export const COMMAND_TTL_MS: Readonly<Record<DeviceCommand, number>> = {
  START_REMOTE_ADMIN: 2 * MINUTE,
  REMOTE_UNLOCK: 2 * MINUTE,
  STOP_REMOTE_ADMIN: 10 * MINUTE,
  TRIGGER_PING: 10 * MINUTE,
  REQUEST_LOCATION: HOUR,
  LOCK_DEVICE: 24 * HOUR,
  RESYNC_DEVICE_INFO: 24 * HOUR,
};

/** Rows with a command this build doesn't know (older data) expire after the longest TTL. */
const FALLBACK_TTL_MS = Math.max(...Object.values(COMMAND_TTL_MS));

export function commandTtlMs(command: string): number {
  return COMMAND_TTL_MS[command as DeviceCommand] ?? FALLBACK_TTL_MS;
}

export function isCommandFresh(command: string, queuedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - queuedAt.getTime() < commandTtlMs(command);
}

function buildCommandMessage(
  command: DeviceCommand,
  options?: CommandDeliveryOptions
): DeviceCommandMessage {
  const message: DeviceCommandMessage = {
    type: "command",
    command,
  };

  if (options?.pin && command === "REMOTE_UNLOCK") {
    message.pin = options.pin;
  }

  if (options?.iceServers && command === "START_REMOTE_ADMIN") {
    message.iceServers = options.iceServers;
  }

  return message;
}

export async function queueCommand(
  uid: string,
  command: DeviceCommand,
  options?: CommandDeliveryOptions
): Promise<void> {
  let payloadObj: Record<string, unknown> | null = null;
  if (options?.pin && command === "REMOTE_UNLOCK") {
    payloadObj = { pin: options.pin };
  } else if (options?.iceServers && command === "START_REMOTE_ADMIN") {
    payloadObj = { iceServers: options.iceServers };
  }
  const payload = payloadObj ? JSON.stringify(payloadObj) : null;

  await pool.query(
    `INSERT INTO pending_commands (uid, command, command_payload)
     VALUES ($1, $2, $3)`,
    [uid, command, payload]
  );
  console.log(`Command queued: uid=${uid} command=${command}`);
}

/** Remove and return a device's queued commands, oldest first, dropping any past their TTL. */
export async function drainCommands(uid: string): Promise<DeviceCommandMessage[]> {
  const result = await pool.query<{
    id: string;
    command: DeviceCommand;
    command_payload: { pin?: string; iceServers?: IceServer[] } | null;
    created_at: Date;
  }>(
    `DELETE FROM pending_commands
     WHERE uid = $1
     RETURNING id, command, command_payload, created_at`,
    [uid]
  );

  const now = new Date();
  // DELETE … RETURNING has no guaranteed order; the BIGSERIAL id is queue order.
  const rows = [...result.rows].sort((a, b) => Number(BigInt(a.id) - BigInt(b.id)));
  const fresh = rows.filter((row) => isCommandFresh(row.command, row.created_at, now));
  const expired = rows.filter((row) => !fresh.includes(row));

  if (expired.length > 0) {
    console.log(
      `Commands expired before delivery: uid=${uid} commands=${expired.map((r) => r.command).join(",")}`
    );
  }
  if (fresh.length > 0) {
    console.log(
      `Commands delivered: uid=${uid} count=${fresh.length} commands=${fresh.map((r) => r.command).join(",")}`
    );
  }

  return fresh.map((row) =>
    buildCommandMessage(row.command, {
      pin: row.command_payload?.pin,
      iceServers: row.command_payload?.iceServers,
    })
  );
}

/** Delete queued commands past their TTL for devices that never came back to collect them. */
export async function purgeExpiredCommands(): Promise<number> {
  let deleted = 0;
  for (const [command, ttlMs] of Object.entries(COMMAND_TTL_MS)) {
    const result = await pool.query(
      `DELETE FROM pending_commands
       WHERE command = $1 AND created_at < NOW() - ($2 * INTERVAL '1 millisecond')`,
      [command, ttlMs]
    );
    deleted += result.rowCount ?? 0;
  }
  const unknown = await pool.query(
    `DELETE FROM pending_commands
     WHERE command <> ALL($1::text[]) AND created_at < NOW() - ($2 * INTERVAL '1 millisecond')`,
    [Object.keys(COMMAND_TTL_MS), FALLBACK_TTL_MS]
  );
  return deleted + (unknown.rowCount ?? 0);
}

export function formatCommandForDevice(
  command: DeviceCommand,
  options?: CommandDeliveryOptions
): DeviceCommandMessage {
  return buildCommandMessage(command, options);
}
