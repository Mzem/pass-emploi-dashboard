import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, describe, it } from 'node:test'
import { createApp } from '../src/app.js'
import { loadConfig, type Config } from '../src/config.js'
import { EventHub } from '../src/events.js'
import { SqliteStore } from '../src/store/sqlite.js'

const silentLogger = { info() {}, warn() {}, error() {} }

interface TestServer {
  baseUrl: string
  server: Server
  store: SqliteStore
  hub: EventHub
  config: Config
}

async function startServer(env: NodeJS.ProcessEnv = {}): Promise<TestServer> {
  const config = loadConfig({ PORT: '0', ...env })
  const store = new SqliteStore(':memory:')
  await store.init()
  const hub = new EventHub()
  const app = createApp({ config, store, hub, logger: silentLogger })
  const server = await new Promise<Server>(resolve => {
    const s = app.listen(0, () => resolve(s))
  })
  const { port } = server.address() as AddressInfo
  return { baseUrl: `http://127.0.0.1:${port}`, server, store, hub, config }
}

async function stopServer(t: TestServer): Promise<void> {
  t.hub.close()
  await new Promise(resolve => t.server.close(resolve))
  await t.store.close()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init)
  assert.equal(response.status, 200, url)
  return response.json()
}

function postHook(baseUrl: string, token: string, body: string, contentType = 'application/json') {
  return fetch(`${baseUrl}/hooks/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body
  })
}

describe('API sans authentification', () => {
  let t: TestServer
  before(async () => {
    t = await startServer({ PUBLIC_URL: 'https://dashboard.example.org/' })
  })
  after(() => stopServer(t))

  it('répond sur /health', async () => {
    const response = await fetch(`${t.baseUrl}/health`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { status: 'ok' })
  })

  it('expose la configuration et les URLs de webhook', async () => {
    const config = await getJson(`${t.baseUrl}/api/config`)
    assert.deepEqual(
      config.categories.map((c: { id: string }) => c.id),
      ['jobs', 'elastic', 'scalingo', 'cve']
    )
    assert.deepEqual(config.envs, ['prod', 'staging'])
    assert.equal(config.defaultEnv, 'prod')
    assert.equal(config.hooks.jobs.prod, 'https://dashboard.example.org/hooks/jobs-prod')
    assert.equal(config.hooks.cve.staging, 'https://dashboard.example.org/hooks/cve-staging')
  })

  it('refuse un token de webhook inconnu', async () => {
    const response = await postHook(t.baseUrl, 'inconnu', '{"text":"x"}')
    assert.equal(response.status, 404)
  })

  it('reçoit un webhook JSON et le rend en HTML', async () => {
    const payload = {
      username: 'CEJ Lama',
      text: '### Résultat du job _X_\n| Statut | :white_check_mark: |\n    |:--|:--|\n    | succes | true |'
    }
    const response = await postHook(t.baseUrl, 'jobs-prod', JSON.stringify(payload))
    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'ok')

    const { messages, hasMore } = await getJson(
      `${t.baseUrl}/api/messages?category=jobs&env=prod`
    )
    assert.equal(hasMore, false)
    assert.equal(messages.length, 1)
    assert.equal(messages[0].username, 'CEJ Lama')
    assert.match(messages[0].html, /<table>/)
    assert.match(messages[0].html, /✅/)
    assert.deepEqual(messages[0].raw, payload)
  })

  it('reçoit un webhook au format formulaire (payload=)', async () => {
    const body = new URLSearchParams({ payload: '{"text":"form staging"}' }).toString()
    const response = await postHook(
      t.baseUrl,
      'jobs-staging',
      body,
      'application/x-www-form-urlencoded'
    )
    assert.equal(response.status, 200)
    const { messages } = await getJson(
      `${t.baseUrl}/api/messages?category=jobs&env=staging`
    )
    assert.equal(messages.length, 1)
    assert.match(messages[0].html, /form staging/)
  })

  it('accepte un payload inconnu et le garde brut', async () => {
    const response = await postHook(t.baseUrl, 'scalingo-staging', '{"hello":"world","level":"info"}')
    assert.equal(response.status, 200)
    const { messages } = await getJson(
      `${t.baseUrl}/api/messages?category=scalingo&env=staging`
    )
    assert.equal(messages[0].html, null)
    assert.deepEqual(messages[0].attachments, [])
    assert.deepEqual(messages[0].raw, { hello: 'world', level: 'info' })
  })

  it('met en forme un évènement Scalingo brut (notifieur de type webhook)', async () => {
    const event = {
      id: '6ab51ad44e36a5bc9f62b1c1',
      type: 'edit_notifier',
      user: { id: 'us-1', email: 'malek@example.org', username: 'malek.zemni' },
      app_id: '619ba6',
      app_name: 'pass-emploi-api-prod',
      type_data: { active: true, notifier_name: 'Dashboard Pass Emploi' },
      created_at: '2026-09-24T12:43:00.494Z'
    }
    const response = await postHook(t.baseUrl, 'scalingo-prod', JSON.stringify(event))
    assert.equal(response.status, 200)
    const { messages } = await getJson(
      `${t.baseUrl}/api/messages?category=scalingo&env=prod`
    )
    assert.equal(messages[0].username, 'Scalingo')
    assert.equal(messages[0].html, null)
    const attachment = messages[0].attachments[0]
    assert.equal(attachment.titleHtml, '[pass-emploi-api-prod] Notifieur modifié')
    assert.equal(attachment.titleLink, 'https://dashboard.scalingo.com/apps/osc-secnum-fr1/pass-emploi-api-prod')
    assert.equal(attachment.footer, 'Par malek.zemni')
    assert.deepEqual(messages[0].raw, event)
  })

  it('accepte un corps vide', async () => {
    const response = await fetch(`${t.baseUrl}/hooks/elastic-prod`, { method: 'POST' })
    assert.equal(response.status, 200)
  })

  it('refuse un payload trop volumineux', async () => {
    const response = await postHook(
      t.baseUrl,
      'elastic-prod',
      JSON.stringify({ text: 'x'.repeat(1_100_000) })
    )
    assert.equal(response.status, 413)
  })

  it('valide les paramètres de listing', async () => {
    const response = await fetch(`${t.baseUrl}/api/messages?category=nope&env=prod`)
    assert.equal(response.status, 400)
  })

  it('compte les messages par catégorie et environnement', async () => {
    const { counts } = await getJson(`${t.baseUrl}/api/counts`)
    assert.deepEqual(counts.jobs.prod, { total: 1, recent: 1 })
    assert.deepEqual(counts.jobs.staging, { total: 1, recent: 1 })
    assert.deepEqual(counts.cve.prod, { total: 0, recent: 0 })
  })

  it('pagine avec before', async () => {
    for (let i = 1; i <= 3; i++) {
      await postHook(t.baseUrl, 'cve-prod', JSON.stringify({ text: `cve ${i}` }))
    }
    const page1 = await getJson(
      `${t.baseUrl}/api/messages?category=cve&env=prod&limit=2`
    )
    assert.equal(page1.messages.length, 2)
    assert.equal(page1.hasMore, true)
    assert.match(page1.messages[0].html, /cve 3/)

    const lastId = page1.messages[1].id
    const page2 = await getJson(
      `${t.baseUrl}/api/messages?category=cve&env=prod&limit=2&before=${lastId}`
    )
    assert.equal(page2.messages.length, 1)
    assert.equal(page2.hasMore, false)
    assert.match(page2.messages[0].html, /cve 1/)
  })

  it('diffuse les nouveaux messages en temps réel (SSE)', async () => {
    const controller = new AbortController()
    const response = await fetch(`${t.baseUrl}/api/events`, { signal: controller.signal })
    assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8')
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()

    await postHook(t.baseUrl, 'elastic-staging', '{"text":"seuil dépassé"}')

    let received = ''
    while (!received.includes('event: notification')) {
      const { value, done } = await reader.read()
      if (done) break
      received += decoder.decode(value)
    }
    controller.abort()
    const data = received.split('data: ')[1]!.split('\n')[0]!
    const message = JSON.parse(data)
    assert.equal(message.category, 'elastic')
    assert.equal(message.env, 'staging')
    assert.match(message.html, /seuil dépassé/)
  })

  it('sert le front', async () => {
    const response = await fetch(`${t.baseUrl}/`)
    assert.equal(response.status, 200)
    assert.match(await response.text(), /Notifications Pass Emploi/)
  })
})

describe('API avec Basic Auth', () => {
  let t: TestServer
  before(async () => {
    t = await startServer({
      DASHBOARD_USER: 'ops',
      DASHBOARD_PASSWORD: 'secret',
      HOOK_TOKEN_JOBS_PROD: 'tok-jobs-prod'
    })
  })
  after(() => stopServer(t))

  it('protège le front et l’API', async () => {
    for (const path of ['/', '/api/config', '/api/messages?category=jobs&env=prod', '/api/events']) {
      const response = await fetch(`${t.baseUrl}${path}`)
      assert.equal(response.status, 401, path)
      assert.match(response.headers.get('www-authenticate') ?? '', /^Basic /)
    }
  })

  it('accepte les bons identifiants', async () => {
    const response = await fetch(`${t.baseUrl}/api/config`, {
      headers: { Authorization: `Basic ${Buffer.from('ops:secret').toString('base64')}` }
    })
    assert.equal(response.status, 200)
  })

  it('refuse un mauvais mot de passe', async () => {
    const response = await fetch(`${t.baseUrl}/api/config`, {
      headers: { Authorization: `Basic ${Buffer.from('ops:faux').toString('base64')}` }
    })
    assert.equal(response.status, 401)
  })

  it('laisse passer les webhooks sans authentification, avec le token configuré', async () => {
    assert.equal((await postHook(t.baseUrl, 'tok-jobs-prod', '{"text":"x"}')).status, 200)
    assert.equal((await postHook(t.baseUrl, 'jobs-prod', '{"text":"x"}')).status, 404)
  })
})

describe('loadConfig', () => {
  it('refuse des tokens en double', () => {
    assert.throws(
      () => loadConfig({ HOOK_TOKEN_JOBS_PROD: 'a', HOOK_TOKEN_CVE_PROD: 'a' }),
      /en double/
    )
  })

  it('refuse un identifiant sans mot de passe', () => {
    assert.throws(() => loadConfig({ DASHBOARD_USER: 'ops' }), /ensemble/)
  })

  it('liste les tokens par défaut', () => {
    const config = loadConfig({ HOOK_TOKEN_JOBS_PROD: 'a' })
    assert.equal(config.defaultTokens.length, 7)
    assert.equal(config.hooks.get('a')?.category, 'jobs')
  })

  it('déduit le SSL Postgres', () => {
    assert.equal(loadConfig({ DATABASE_URL: 'postgres://u:p@host.scalingo.com:5432/db?sslmode=prefer' }).databaseSsl, true)
    assert.equal(loadConfig({ DATABASE_URL: 'postgres://u:p@localhost:5432/db' }).databaseSsl, false)
    assert.equal(loadConfig({ DATABASE_URL: 'postgres://u:p@host:5432/db', DATABASE_SSL: 'false' }).databaseSsl, false)
  })
})
