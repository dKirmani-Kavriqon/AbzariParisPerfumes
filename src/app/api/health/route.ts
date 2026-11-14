import { z } from 'zod'
import { store } from '../../../config/store'
import { getServerEnv } from '../../../server/env'
import { getDb, pingDatabase } from '../../../server/db/client'
import { forbidden } from '../../../server/http/errors'
import { ok } from '../../../server/http/response'
import { onlyMethods, route } from '../../../server/http/route'
import { parseQuery } from '../../../server/http/validate'
import { timingSafeEqual } from '../../../server/security'

export const dynamic = 'force-dynamic'

const query = z.object({ checks: z.enum(['db']).optional() })

/**
 * GET /api/health            -> the app is up and its configuration is valid. Never touches the database.
 * GET /api/health?checks=db  -> also round-trips the database. Needs the `x-health-token`
 *                               header to match HEALTH_CHECK_TOKEN, so anonymous traffic
 *                               cannot keep the database awake (Neon free compute is metered).
 */
export const GET = route(async (request, { requestId, log }) => {
  const env = getServerEnv() // throws (500, logged) if configuration is invalid
  const { checks } = parseQuery(request, query)

  const body: Record<string, unknown> = {
    status: 'ok',
    store: store.id,
    environment: env.APP_ENV,
    database: env.DATABASE_URL ? 'configured' : 'not configured',
  }

  if (checks === 'db') {
    const supplied = request.headers.get('x-health-token') ?? ''
    if (!env.HEALTH_CHECK_TOKEN || !timingSafeEqual(supplied, env.HEALTH_CHECK_TOKEN)) throw forbidden('The database check needs a valid health token.')
    const { latencyMs } = await pingDatabase(getDb())
    body.database = 'reachable'
    body.databaseLatencyMs = latencyMs
    log.info('database check', { latencyMs })
  }
  return ok(body, requestId)
})

export const POST = onlyMethods('GET')
export const PUT = onlyMethods('GET')
export const PATCH = onlyMethods('GET')
export const DELETE = onlyMethods('GET')
