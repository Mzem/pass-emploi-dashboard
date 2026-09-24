import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { EventHub } from './events.js'
import { createStore } from './store/index.js'

const PURGE_INTERVAL_MS = 60 * 60 * 1000

const config = loadConfig()
const { store, description: storeDescription } = createStore(config)
await store.init()

const hub = new EventHub()
const app = createApp({ config, store, hub })

async function purge(): Promise<void> {
  const threshold = new Date(
    Date.now() - config.retentionDays * 24 * 60 * 60 * 1000
  ).toISOString()
  try {
    const deleted = await store.purgeBefore(threshold)
    if (deleted > 0) {
      console.info(`[purge] ${deleted} notification(s) de plus de ${config.retentionDays} jours supprimée(s)`)
    }
  } catch (error) {
    console.error('[purge] échec', error)
  }
}
await purge()
setInterval(purge, PURGE_INTERVAL_MS).unref()

const server = app.listen(config.port, () => {
  console.info(`[démarrage] http://localhost:${config.port} · stockage : ${storeDescription}`)
  console.info(`[démarrage] rétention : ${config.retentionDays} jours · webhooks : ${config.hooks.size}`)
  if (!config.auth) {
    console.warn('[démarrage] ⚠ DASHBOARD_USER / DASHBOARD_PASSWORD absents : tableau de bord accessible sans authentification')
  }
  if (config.defaultTokens.length > 0) {
    console.warn(`[démarrage] ⚠ tokens de webhook par défaut (devinables) pour : ${config.defaultTokens.join(', ')}`)
  }
})

let stopping = false
async function shutdown(signal: string): Promise<void> {
  if (stopping) return
  stopping = true
  console.info(`[arrêt] ${signal} reçu`)
  hub.close()
  server.close()
  await store.close()
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
