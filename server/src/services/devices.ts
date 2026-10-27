import { randomBytes } from "crypto";
import { pool, withTransaction } from "../db/pool.js";
import type {
  DeviceRegistration,
  DeviceRow,
  TelemetryPayload,
  DeviceEventPayload,
  LocationHistoryPoint,
  SampledLocationPoint,
} from "../types.js";
import {
  downsampleLocationHistory,
} from "./locationHistory.js";

import bcrypt from "bcrypt";
import { consumeEnrollmentToken, lockUsableEnrollmentToken } from "./enrollmentTokens.js";

function generateConnectionSecret(): string {
  return randomBytes(32).toString("hex");
}

/** Proof of Possession: an enrolled uid may only re-register with its current secret. */
async function assertProofOfPossession(
  device: DeviceRow,
  providedSecret?: string
): Promise<void> {
  if (!providedSecret) {
    throw new Error("Missing x-connection-secret header for existing device re-registration. Wiped devices must be deleted from the portal before re-enrolling.");
  }

  const validSecret = await bcrypt.compare(providedSecret, device.connection_secret);
  if (!validSecret) {
    throw new Error("Invalid connection secret provided for existing device re-registration.");
  }
}

/**
 * The token is checked first, then Proof of Possession, and only then consumed —
 * all in one transaction, so a rejected or failed registration never uses it up.
 */
export async function registerDevice(
  data: DeviceRegistration,
  providedSecret?: string
): Promise<{ device: DeviceRow; connection_secret: string; is_new: boolean }> {
  const enrollmentToken = data.enrollment_token;
  if (!enrollmentToken) {
    throw new Error("Missing enrollment_token");
  }

  return withTransaction(async (client) => {
    const tokenRecord = await lockUsableEnrollmentToken(client, enrollmentToken);
    if (!tokenRecord) {
      throw new Error("Invalid, expired, or fully consumed enrollment token");
    }

    const agency = data.agency ?? tokenRecord.agency ?? null;

    const existing = await client.query<DeviceRow>(
      "SELECT * FROM devices WHERE uid = $1 FOR UPDATE",
      [data.uid]
    );
    const existingDevice = existing.rows[0];

    if (existingDevice) {
      await assertProofOfPossession(existingDevice, providedSecret);
    }

    await consumeEnrollmentToken(client, enrollmentToken);

    const connection_secret = generateConnectionSecret();
    const hashedSecret = await bcrypt.hash(connection_secret, 10);

    if (existingDevice) {
      const updated = await client.query<DeviceRow>(
        `UPDATE devices SET
          serial = COALESCE($2, serial),
          imei = COALESCE($3, imei),
          device_name = $4,
          model = COALESCE($5, model),
          agency = COALESCE($6, agency),
          phone_number = COALESCE($7, phone_number),
          app_version = COALESCE($8, app_version),
          public_key = COALESCE($9, public_key),
          connection_secret = $10,
          last_seen_at = NOW()
        WHERE uid = $1
        RETURNING *`,
        [
          data.uid,
          data.serial ?? null,
          data.imei ?? null,
          data.device_name,
          data.model ?? null,
          agency,
          data.phone_number ?? null,
          data.app_version ?? null,
          data.public_key ?? null,
          hashedSecret,
        ]
      );
      return {
        device: updated.rows[0],
        connection_secret,
        is_new: false,
      };
    }

    const inserted = await client.query<DeviceRow>(
      `INSERT INTO devices (
        uid, serial, imei, device_name, model, agency, phone_number, app_version,
        connection_secret, public_key, last_seen_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING *`,
      [
        data.uid,
        data.serial ?? null,
        data.imei ?? null,
        data.device_name,
        data.model ?? null,
        agency,
        data.phone_number ?? null,
        data.app_version ?? null,
        hashedSecret,
        data.public_key ?? null,
      ]
    );

    return {
      device: inserted.rows[0],
      connection_secret,
      is_new: true,
    };
  });
}

export async function recordTelemetry(data: TelemetryPayload): Promise<void> {
  const recordedAt = data.timestamp
    ? new Date(data.timestamp)
    : new Date();

  await pool.query(
    `UPDATE devices SET
      last_lat = COALESCE($2, last_lat),
      last_lon = COALESCE($3, last_lon),
      last_location_accuracy_m = COALESCE($4, last_location_accuracy_m),
      last_battery = COALESCE($5, last_battery),
      last_is_charging = COALESCE($6, last_is_charging),
      last_telemetry_at = $7,
      last_seen_at = NOW()
    WHERE uid = $1`,
    [
      data.uid,
      data.lat ?? null,
      data.lon ?? null,
      data.accuracy_m ?? null,
      data.battery ?? null,
      data.is_charging ?? null,
      recordedAt,
    ]
  );

  await pool.query(
    `INSERT INTO telemetry_history (uid, lat, lon, accuracy_m, battery, is_charging, recorded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      data.uid,
      data.lat ?? null,
      data.lon ?? null,
      data.accuracy_m ?? null,
      data.battery ?? null,
      data.is_charging ?? null,
      recordedAt,
    ]
  );
}

export async function recordEvent(data: DeviceEventPayload): Promise<void> {
  await pool.query(
    `INSERT INTO device_events (uid, event, payload) VALUES ($1, $2, $3)`,
    [data.uid, data.event, data.payload ? JSON.stringify(data.payload) : null]
  );

  await pool.query(
    "UPDATE devices SET last_seen_at = NOW() WHERE uid = $1",
    [data.uid]
  );
}

export async function listDevices(): Promise<DeviceRow[]> {
  const result = await pool.query<DeviceRow>(
    "SELECT * FROM devices ORDER BY device_name ASC"
  );
  return result.rows;
}

export async function getDevice(uid: string): Promise<DeviceRow | null> {
  const result = await pool.query<DeviceRow>(
    "SELECT * FROM devices WHERE uid = $1",
    [uid]
  );
  return result.rows[0] ?? null;
}

export async function pingDevice(uid: string): Promise<DeviceRow | null> {
  const device = await getDevice(uid);
  if (!device) return null;

  await pool.query(
    "UPDATE devices SET last_seen_at = NOW() WHERE uid = $1",
    [uid]
  );
  return device;
}

export async function deleteDevice(uid: string): Promise<boolean> {
  const result = await pool.query("DELETE FROM devices WHERE uid = $1", [uid]);
  return (result.rowCount ?? 0) > 0;
}

export async function setDeviceOnline(uid: string, online: boolean): Promise<void> {
  await pool.query(
    "UPDATE devices SET is_online = $2, last_seen_at = NOW() WHERE uid = $1",
    [uid, online]
  );
}

export async function touchLastSeen(uid: string): Promise<void> {
  await pool.query("UPDATE devices SET last_seen_at = NOW() WHERE uid = $1", [uid]);
}

/** In-memory WebSocket registry is lost on restart; clear stale flags. */
export async function resetLiveSessionFlags(): Promise<void> {
  await pool.query(
    "UPDATE devices SET is_online = false, remote_admin_active = false"
  );
}

export async function setRemoteAdminActive(
  uid: string,
  active: boolean
): Promise<void> {
  await pool.query(
    "UPDATE devices SET remote_admin_active = $2 WHERE uid = $1",
    [uid, active]
  );
}

export async function getTelemetryHistory(
  uid: string,
  limit = 50
): Promise<unknown[]> {
  const result = await pool.query(
    `SELECT lat, lon, accuracy_m, battery, is_charging, recorded_at
     FROM telemetry_history WHERE uid = $1
     ORDER BY recorded_at DESC LIMIT $2`,
    [uid, limit]
  );
  return result.rows;
}

/** Points between two instants, newest first. `newestAt` is the API's from_at, `oldestAt` its to_at. */
export async function getLocationHistory(
  uid: string,
  newestAt: Date,
  oldestAt: Date
): Promise<SampledLocationPoint[]> {
  const points = await queryLocationHistoryPoints(uid, newestAt, oldestAt);
  return downsampleLocationHistory(points);
}

export async function getLocationHistoryFull(
  uid: string,
  newestAt: Date,
  oldestAt: Date
): Promise<SampledLocationPoint[]> {
  const points = await queryLocationHistoryPoints(uid, newestAt, oldestAt);

  return points.map((point, index) => ({
    number: index + 1,
    lat: point.lat,
    lon: point.lon,
    accuracy_m: point.accuracy_m,
    recorded_at: point.recorded_at.toISOString(),
  }));
}

async function queryLocationHistoryPoints(
  uid: string,
  newestAt: Date,
  oldestAt: Date
): Promise<LocationHistoryPoint[]> {
  const result = await pool.query<{
    lat: number;
    lon: number;
    accuracy_m: number | null;
    recorded_at: Date;
  }>(
    `SELECT lat, lon, accuracy_m, recorded_at
     FROM telemetry_history
     WHERE uid = $1
       AND lat IS NOT NULL
       AND lon IS NOT NULL
       AND recorded_at >= $2
       AND recorded_at <= $3
     ORDER BY recorded_at DESC`,
    [uid, oldestAt, newestAt]
  );

  return result.rows.map((row) => ({
    lat: row.lat,
    lon: row.lon,
    accuracy_m: row.accuracy_m,
    recorded_at: row.recorded_at,
  }));
}

export const LOCATION_HISTORY_RETENTION_DAYS = 30;

/** Remove telemetry history rows older than the retention window. */
export async function purgeOldLocationHistory(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM telemetry_history
     WHERE recorded_at < NOW() - ($1 * INTERVAL '1 day')`,
    [LOCATION_HISTORY_RETENTION_DAYS]
  );
  return result.rowCount ?? 0;
}

export async function getDeviceEvents(uid: string, limit = 50): Promise<unknown[]> {
  const result = await pool.query(
    `SELECT event, payload, created_at
     FROM device_events WHERE uid = $1
     ORDER BY created_at DESC LIMIT $2`,
    [uid, limit]
  );
  return result.rows;
}
