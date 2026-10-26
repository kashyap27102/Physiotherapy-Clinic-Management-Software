import { httpApi } from './http'
import { mockApi } from './mock'
import type { Api } from './types'

/** Mock data is the default until the backend exists. Set VITE_USE_MOCK_API=false to call the real API. */
export const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API !== 'false'

export const api: Api = USE_MOCK_API ? mockApi : httpApi

export * from './errors'
export type * from './types'
