import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express, { type ErrorRequestHandler } from 'express'
import { basicAuth } from './auth.js'
import {
  CATEGORIES,
  DEFAULT_ENV,
  ENVS,
  isCategory,
  isEnv,
  type Category,
  type Config,
  type Env
} from './config.js'
import type { EventHub } from './events.js'
import { presentMessage } from './render.js'
import type { Message, Store } from './store/types.js'
import { parseWebhookBody, toNewMessage } from './webhook.js'

const PUBLIC_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public'
)

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200
const MAX_BODY_SIZE = '1mb'
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000

export interface AppDeps {
  config: Config
  store: Store
  hub: EventHub
  logger?: Pick<Console, 'info' | 'warn' | 'error'>
}

export function createApp({
  config,
  store,
  hub,
  logger = console
}: AppDeps): express.Express {
  const app = express()
  const present = (message: Message) =>
    presentMessage(message, { scalingoRegion: config.scalingoRegion })
  app.disable('x-powered-by')
  // Derrière le routeur Scalingo : protocole et hôte d'origine (URLs de webhook).
  app.set('trust proxy', true)

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  // Webhooks entrants : pas de Basic Auth, le token dans l'URL fait office de secret.
  app.post(
    '/hooks/:token',
    express.text({ type: () => true, limit: MAX_BODY_SIZE }),
    async (req, res) => {
      const target = config.hooks.get(req.params.token)
      if (!target) {
        res.status(404).json({ error: 'Webhook inconnu' })
        return
      }
      const body = typeof req.body === 'string' ? req.body : ''
      const payload = parseWebhookBody(req.headers['content-type'], body)
      const message = await store.insert(toNewMessage(target, payload))
      hub.publish('notification', present(message))
      logger.info(
        `[webhook] ${target.category}/${target.env} → message #${message.id}`
      )
      // Même réponse que Mattermost.
      res.type('text').send('ok')
    }
  )

  if (config.auth) {
    app.use(basicAuth(config.auth.user, config.auth.password))
  }

  app.get('/api/config', (req, res) => {
    const baseUrl =
      config.publicUrl ?? `${req.protocol}://${req.get('host') ?? 'localhost'}`
    const hooks = {} as Record<Category, Record<Env, string>>
    for (const [token, target] of config.hooks) {
      hooks[target.category] ??= {} as Record<Env, string>
      hooks[target.category][target.env] = `${baseUrl}/hooks/${token}`
    }
    res.json({
      categories: CATEGORIES,
      envs: ENVS,
      defaultEnv: DEFAULT_ENV,
      retentionDays: config.retentionDays,
      hooks
    })
  })

  app.get('/api/messages', async (req, res) => {
    const { category, env } = req.query
    if (!isCategory(category) || !isEnv(env)) {
      res.status(400).json({ error: 'Paramètres category et env invalides' })
      return
    }
    const limit = clampInt(req.query.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
    const before = clampInt(req.query.before, 0, 1, Number.MAX_SAFE_INTEGER)

    const rows = await store.list({
      category,
      env,
      before: before || undefined,
      limit: limit + 1
    })
    const hasMore = rows.length > limit
    res.json({
      messages: rows.slice(0, limit).map(present),
      hasMore
    })
  })

  app.get('/api/counts', async (_req, res) => {
    const since = new Date(Date.now() - RECENT_WINDOW_MS).toISOString()
    const counts = {} as Record<Category, Record<Env, { total: number; recent: number }>>
    for (const category of CATEGORIES) {
      counts[category.id] = {} as Record<Env, { total: number; recent: number }>
      for (const env of ENVS) {
        counts[category.id][env] = { total: 0, recent: 0 }
      }
    }
    for (const row of await store.counts(since)) {
      if (isCategory(row.category) && isEnv(row.env)) {
        counts[row.category][row.env] = { total: row.total, recent: row.recent }
      }
    }
    res.json({ since, counts })
  })

  app.get('/api/events', (_req, res) => {
    hub.subscribe(res)
  })

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Introuvable' })
  })

  app.use(express.static(PUBLIC_DIR, { index: 'index.html' }))

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    const error = err as { type?: string; status?: number; message?: string }
    if (error.type === 'entity.too.large') {
      res.status(413).json({ error: `Payload trop volumineux (max ${MAX_BODY_SIZE})` })
      return
    }
    logger.error('[erreur]', err)
    res.status(error.status ?? 500).json({ error: 'Erreur interne' })
  }
  app.use(errorHandler)

  return app
}

function clampInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  if (typeof value !== 'string' || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return fallback
  return Math.min(Math.max(parsed, min), max)
}
