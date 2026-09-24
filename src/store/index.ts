import path from 'node:path'
import type { Config } from '../config.js'
import { PostgresStore } from './postgres.js'
import { SqliteStore } from './sqlite.js'
import type { Store } from './types.js'

export type { Store } from './types.js'

export interface StoreInfo {
  store: Store
  description: string
}

/** PostgreSQL si DATABASE_URL est défini (Scalingo), sinon SQLite local. */
export function createStore(config: Config): StoreInfo {
  if (config.databaseUrl) {
    return {
      store: new PostgresStore(config.databaseUrl, config.databaseSsl),
      description: `PostgreSQL (${describeUrl(config.databaseUrl)}, ssl=${config.databaseSsl})`
    }
  }
  const file = path.join(config.dataDir, 'dashboard.sqlite')
  return { store: new SqliteStore(file), description: `SQLite (${file})` }
}

function describeUrl(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl)
    return `${url.hostname}${url.pathname}`
  } catch {
    return 'url illisible'
  }
}
