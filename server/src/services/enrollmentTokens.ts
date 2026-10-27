import { randomBytes } from "node:crypto";
import type pg from "pg";
import { pool } from "../db/pool.js";

/** Enrollment tokens: admin management plus the locked check/consume used by registration. */

export type EnrollmentTokenType = "qr" | "mdm";

const MINUTE = 60_000;

/** QR token lifetimes offered in the UI. MDM tokens never expire and have no use limit. */
const QR_DURATIONS: Readonly<Record<string, { maxUses?: number; lifetimeMs?: number }>> = {
  single_use: { maxUses: 1 },
  "10_min": { lifetimeMs: 10 * MINUTE },
  "1_hour": { lifetimeMs: 60 * MINUTE },
  "8_hours": { lifetimeMs: 8 * 60 * MINUTE },
  "24_hours": { lifetimeMs: 24 * 60 * MINUTE },
  // "no_expiration" and anything unrecognised: no limit.
};

export function enrollmentTokenLimits(
  type: EnrollmentTokenType,
  duration: unknown,
  now: Date = new Date()
): { maxUses: number | null; expiresAt: Date | null } {
  const rule = type === "qr" && typeof duration === "string" ? QR_DURATIONS[duration] : undefined;
  return {
    maxUses: rule?.maxUses ?? null,
    expiresAt: rule?.lifetimeMs ? new Date(now.getTime() + rule.lifetimeMs) : null,
  };
}

export interface NewEnrollmentToken {
  type?: unknown;
  duration?: unknown;
  agency?: string;
  description: string;
  tlsPinHash?: string;
}

export async function listEnrollmentTokens(): Promise<unknown[]> {
  const result = await pool.query("SELECT * FROM enrollment_tokens ORDER BY created_at DESC");
  return result.rows;
}

export async function createEnrollmentToken(input: NewEnrollmentToken): Promise<unknown> {
  const type: EnrollmentTokenType = input.type === "mdm" ? "mdm" : "qr";
  const { maxUses, expiresAt } = enrollmentTokenLimits(type, input.duration);
  const token = randomBytes(24).toString("hex");
  const result = await pool.query(
    `INSERT INTO enrollment_tokens (token, type, max_uses, expires_at, agency, description, tls_pin_hash, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE) RETURNING *`,
    [token, type, maxUses, expiresAt, input.agency || null, input.description, input.tlsPinHash || null]
  );
  return result.rows[0];
}

export async function revokeEnrollmentToken(token: string): Promise<void> {
  await pool.query("UPDATE enrollment_tokens SET is_active = FALSE WHERE token = $1", [token]);
}

export async function removeEnrollmentToken(token: string): Promise<void> {
  await pool.query("DELETE FROM enrollment_tokens WHERE token = $1", [token]);
}

export interface UsableEnrollmentToken {
  token: string;
  agency: string | null;
}

/**
 * Lock a usable enrollment token for the rest of the transaction, so concurrent
 * registrations cannot both pass a token that has one use left.
 */
export async function lockUsableEnrollmentToken(
  client: pg.PoolClient,
  token: string
): Promise<UsableEnrollmentToken | null> {
  const result = await client.query<UsableEnrollmentToken>(
    `SELECT token, agency FROM enrollment_tokens
     WHERE token = $1
       AND is_active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (max_uses IS NULL OR uses < max_uses)
     FOR UPDATE`,
    [token]
  );
  return result.rows[0] ?? null;
}

export async function consumeEnrollmentToken(
  client: pg.PoolClient,
  token: string
): Promise<void> {
  await client.query(
    `UPDATE enrollment_tokens SET
       uses = uses + 1,
       is_active = CASE WHEN max_uses IS NOT NULL AND uses + 1 >= max_uses THEN FALSE ELSE is_active END
     WHERE token = $1`,
    [token]
  );
}
