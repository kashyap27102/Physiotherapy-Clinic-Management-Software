import { httpApi } from './http'
import type { Api } from './types'

/** The real `/api/v1` backend. Vite proxies `/api` to the Express server in development. */
export const api: Api = httpApi

export * from './errors'
export type * from './types'
