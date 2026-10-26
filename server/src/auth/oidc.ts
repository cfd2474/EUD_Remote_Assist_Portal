import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { Request, Response, NextFunction } from "express";
import { config } from "../config.js";

const jwks = createRemoteJWKSet(new URL(config.oidc.jwksUri));

export interface AdminUser extends JWTPayload {
  email?: string;
  preferred_username?: string;
  name?: string;
  groups?: string[];
}

export type AdminTokenResult =
  | { ok: true; user: AdminUser }
  | { ok: false; reason: "invalid" | "forbidden"; user?: AdminUser };

declare global {
  namespace Express {
    interface Request {
      adminUser?: AdminUser;
    }
  }
}

/** Admins are allowed by email or by group membership; with neither configured, no one is (fails closed). */
function isAuthorizedAdmin(user: AdminUser): boolean {
  if (config.oidc.adminEmails && user.email) {
    if (config.oidc.adminEmails.includes(user.email.toLowerCase())) {
      return true;
    }
  }

  if (config.oidc.adminGroup) {
    const groups = Array.isArray(user.groups) ? user.groups : [];
    if (groups.includes(config.oidc.adminGroup)) {
      return true;
    }
  }

  return false;
}

/** Verify an OIDC access token and check admin authorization. Shared by REST and WebSocket. */
export async function verifyAdminToken(token: string): Promise<AdminTokenResult> {
  let user: AdminUser;
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.oidc.issuer,
      ...(config.oidc.audience ? { audience: config.oidc.audience } : {}),
    });
    user = payload as AdminUser;
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (!isAuthorizedAdmin(user)) {
    return { ok: false, reason: "forbidden", user };
  }

  return { ok: true, user };
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const result = await verifyAdminToken(authHeader.slice(7));
  if (!result.ok) {
    if (result.reason === "forbidden") {
      res.status(403).json({ error: "Forbidden: Account is not authorized as an admin" });
    } else {
      res.status(401).json({ error: "Invalid or expired token" });
    }
    return;
  }

  req.adminUser = result.user;
  next();
}
