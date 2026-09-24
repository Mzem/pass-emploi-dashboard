import path from 'node:path'

export const CATEGORIES = [
  {
    id: 'jobs',
    label: 'Jobs',
    icon: '⚙️',
    description:
      'Résultats des jobs et rapport quotidien des CRONs (pass-emploi-api)'
  },
  {
    id: 'elastic',
    label: 'Elastic',
    icon: '📈',
    description: 'Alertes de seuil Elastic / Kibana'
  },
  {
    id: 'scalingo',
    label: 'Scalingo',
    icon: '🚀',
    description:
      'Notifications Scalingo (déploiements, incidents, ressources)'
  },
  {
    id: 'cve',
    label: 'CVE',
    icon: '🛡️',
    description: 'Alertes de sécurité GitHub / Dependabot'
  }
] as const

export type Category = (typeof CATEGORIES)[number]['id']

export const ENVS = ['prod', 'staging'] as const
export type Env = (typeof ENVS)[number]
export const DEFAULT_ENV: Env = 'prod'

/** Région Scalingo des apps Pass Emploi, pour les liens vers le dashboard Scalingo. */
export const DEFAULT_SCALINGO_REGION = 'osc-secnum-fr1'

const CATEGORY_IDS: readonly string[] = CATEGORIES.map(c => c.id)

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && CATEGORY_IDS.includes(value)
}

export function isEnv(value: unknown): value is Env {
  return typeof value === 'string' && (ENVS as readonly string[]).includes(value)
}

export interface HookTarget {
  category: Category
  env: Env
}

export interface Config {
  port: number
  /** URL publique de l'appli, utilisée pour afficher les URLs de webhook. */
  publicUrl: string | null
  databaseUrl: string | null
  /** Chiffrement TLS vers Postgres (certificat auto-signé accepté, comme sur Scalingo). */
  databaseSsl: boolean
  /** Dossier du fichier SQLite quand DATABASE_URL est absent. */
  dataDir: string
  retentionDays: number
  scalingoRegion: string
  auth: { user: string; password: string } | null
  /** token → cible (catégorie + environnement) */
  hooks: Map<string, HookTarget>
  /** Variables HOOK_TOKEN_* absentes, remplacées par le token par défaut "<catégorie>-<env>". */
  defaultTokens: string[]
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

export function hookTokenEnvName(category: Category, env: Env): string {
  return `HOOK_TOKEN_${category.toUpperCase()}_${env.toUpperCase()}`
}

export function defaultHookToken(category: Category, env: Env): string {
  return `${category}-${env}`
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const hooks = new Map<string, HookTarget>()
  const defaultTokens: string[] = []

  for (const category of CATEGORIES) {
    for (const environment of ENVS) {
      const name = hookTokenEnvName(category.id, environment)
      let token = env[name]?.trim()
      if (!token) {
        token = defaultHookToken(category.id, environment)
        defaultTokens.push(name)
      }
      if (!TOKEN_PATTERN.test(token)) {
        throw new Error(
          `${name} invalide : uniquement lettres, chiffres, "-" et "_" (128 caractères max)`
        )
      }
      if (hooks.has(token)) {
        throw new Error(`Token de webhook en double : ${name}`)
      }
      hooks.set(token, { category: category.id, env: environment })
    }
  }

  const user = env.DASHBOARD_USER?.trim() ?? ''
  const password = env.DASHBOARD_PASSWORD ?? ''
  if ((user && !password) || (!user && password)) {
    throw new Error(
      'DASHBOARD_USER et DASHBOARD_PASSWORD doivent être définis ensemble'
    )
  }

  const retentionDays = Number(env.RETENTION_DAYS ?? '30')
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    throw new Error('RETENTION_DAYS doit être un nombre de jours positif')
  }

  const port = Number(env.PORT ?? '3100')
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('PORT invalide')
  }

  const databaseUrl =
    env.DATABASE_URL?.trim() || env.SCALINGO_POSTGRESQL_URL?.trim() || null

  return {
    port,
    publicUrl: env.PUBLIC_URL?.trim().replace(/\/+$/, '') || null,
    databaseUrl,
    databaseSsl: resolveDatabaseSsl(databaseUrl, env.DATABASE_SSL),
    dataDir: path.resolve(env.DATA_DIR?.trim() || 'data'),
    retentionDays,
    scalingoRegion: env.SCALINGO_REGION?.trim() || DEFAULT_SCALINGO_REGION,
    auth: user && password ? { user, password } : null,
    hooks,
    defaultTokens
  }
}

function resolveDatabaseSsl(
  databaseUrl: string | null,
  override: string | undefined
): boolean {
  if (override !== undefined && override !== '') {
    return !['false', '0', 'no', 'disable'].includes(override.toLowerCase())
  }
  if (!databaseUrl) return false
  if (/sslmode=disable/i.test(databaseUrl)) return false
  try {
    const host = new URL(databaseUrl).hostname
    return host !== 'localhost' && host !== '127.0.0.1'
  } catch {
    return true
  }
}
