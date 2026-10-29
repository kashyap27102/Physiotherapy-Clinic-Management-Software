import { Router } from 'express'
import { env } from '../config/env.js'
import { createRateLimiter } from '../middleware/rateLimit.js'
import { csrfProtection, sessionMiddleware } from '../middleware/session.js'
import { createAuthRouter } from '../modules/auth/auth.routes.js'
import { branchesRouter } from '../modules/branches/branches.routes.js'
import { clinicRouter } from '../modules/clinic/clinic.routes.js'
import { createRegistrationRouter } from '../modules/registration/registration.routes.js'
import { patientsRouter } from '../modules/patients/patients.routes.js'
import { rolesRouter } from '../modules/roles/roles.routes.js'
import { usersRouter } from '../modules/users/users.routes.js'
import { healthRouter } from '../modules/health/health.routes.js'

export const v1Router = Router()

// Public, unthrottled: used by hosting health checks.
v1Router.use(healthRouter)

// Everything below is rate limited. Feature routers are mounted here as they are built
// (auth, patients, visits, payments, ...), each in its own folder under src/modules.
v1Router.use(
  createRateLimiter({
    limit: env.NODE_ENV === 'test' ? 10_000 : env.RATE_LIMIT_PER_MINUTE,
  }),
)

// Cookie session first, then CSRF, so every router below sees `req.auth` and cross-site writes are refused.
v1Router.use(sessionMiddleware)
v1Router.use(csrfProtection)

v1Router.use(createAuthRouter())
v1Router.use(createRegistrationRouter())
v1Router.use(clinicRouter)
v1Router.use(branchesRouter)
v1Router.use(usersRouter)
v1Router.use(rolesRouter)
v1Router.use(patientsRouter)
