import { Router } from "express";
import { env } from "../config/env.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { healthRouter } from "../modules/health/health.routes.js";

export const v1Router = Router();

// Public, unthrottled: used by hosting health checks.
v1Router.use(healthRouter);

// Everything below is rate limited. Feature routers are mounted here as they are built
// (auth, patients, visits, payments, ...), each in its own folder under src/modules.
v1Router.use(
  createRateLimiter({
    limit: env.NODE_ENV === "test" ? 10_000 : env.RATE_LIMIT_PER_MINUTE,
  }),
);
