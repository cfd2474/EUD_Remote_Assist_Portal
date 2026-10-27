import { Router } from "express";
import {
  createEnrollmentToken,
  listEnrollmentTokens,
  removeEnrollmentToken,
  revokeEnrollmentToken,
} from "../../services/enrollmentTokens.js";

/** Admin management of enrollment tokens (QR and MDM). */
export const enrollmentTokensRouter = Router();

enrollmentTokensRouter.get("/enrollment-tokens", async (_req, res) => {
  try {
    res.json({ tokens: await listEnrollmentTokens() });
  } catch (err) {
    console.error("List enrollment tokens error:", err);
    res.status(500).json({ error: "Failed to list enrollment tokens" });
  }
});

enrollmentTokensRouter.post("/enrollment-tokens", async (req, res) => {
  const { type, duration, agency, description, tls_pin_hash } = req.body ?? {};
  if (!description) {
    res.status(400).json({ error: "Description is required" });
    return;
  }

  try {
    const token = await createEnrollmentToken({
      type,
      duration,
      agency,
      description,
      tlsPinHash: tls_pin_hash,
    });
    res.json({ token });
  } catch (err) {
    console.error("Create enrollment token error:", err);
    res.status(500).json({ error: "Failed to create enrollment token" });
  }
});

enrollmentTokensRouter.delete("/enrollment-tokens/:token", async (req, res) => {
  try {
    await revokeEnrollmentToken(req.params.token);
    res.json({ ok: true });
  } catch (err) {
    console.error("Revoke enrollment token error:", err);
    res.status(500).json({ error: "Failed to revoke token" });
  }
});

enrollmentTokensRouter.delete("/enrollment-tokens/:token/remove", async (req, res) => {
  try {
    await removeEnrollmentToken(req.params.token);
    res.json({ ok: true });
  } catch (err) {
    console.error("Remove enrollment token error:", err);
    res.status(500).json({ error: "Failed to remove token" });
  }
});
