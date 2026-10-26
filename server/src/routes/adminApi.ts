import { Router } from "express";
import { requireAdmin } from "../auth/oidc.js";
import { devicesRouter } from "./admin/devices.js";
import { portalConfigRouter } from "./admin/portalConfig.js";
import { enrollmentTokensRouter } from "./admin/enrollmentTokens.js";

/** Everything under /api/admin requires an authorized admin (OIDC). */
export const adminApiRouter = Router();

adminApiRouter.use(requireAdmin);

adminApiRouter.get("/me", (req, res) => {
  res.json({
    user: {
      email: req.adminUser?.email,
      username: req.adminUser?.preferred_username,
      name: req.adminUser?.name,
    },
  });
});

adminApiRouter.use(devicesRouter);
adminApiRouter.use(portalConfigRouter);
adminApiRouter.use(enrollmentTokensRouter);
