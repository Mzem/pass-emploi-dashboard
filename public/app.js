const state = {
  config: null,
  category: null,
  env: null,
  messages: [],
  hasMore: false,
  counts: {},
  loading: false,
  newIds: new Set(),
  eventSource: null,
  wasOffline: false
}

const $ = id => document.getElementById(id)
const ENV_LABELS = { prod: 'Prod', staging: 'Staging' }
const TIME_ZONE = 'Europe/Paris'
const timeFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
})
const dayFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric'
})
const dayKeyFormat = new Intl.DateTimeFormat('fr-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})
const fullFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIME_ZONE,
  dateStyle: 'full',
  timeStyle: 'long'
})

async function api(path) {
  const response = await fetch(path, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`${response.status} sur ${path}`)
  return response.json()
}

function categoryOf(id) {
  return state.config.categories.find(c => c.id === id)
}

// ---------------------------------------------------------------- routage

function parseHash() {
  const match = location.hash.match(/^#\/([a-z]+)(?:\/([a-z]+))?/)
  const ids = state.config.categories.map(c => c.id)
  const category = match && ids.includes(match[1]) ? match[1] : ids[0]
  const env =
    match && state.config.envs.includes(match[2]) ? match[2] : state.config.defaultEnv
  return { category, env }
}

function navigate(category, env) {
  const hash = `#/${category}/${env}`
  if (location.hash === hash) return
  location.hash = hash
}

async function applyRoute() {
  const { category, env } = parseHash()
  state.category = category
  state.env = env
  document.title = `${categoryOf(category).label} · ${ENV_LABELS[env]} · Notifications Pass Emploi`
  renderTabs()
  renderEnvSwitch()
  renderHookPanel()
  await loadMessages({ reset: true })
}

// ---------------------------------------------------------------- données

async function loadConfig() {
  state.config = await api('/api/config')
}

async function loadCounts() {
  try {
    const { counts } = await api('/api/counts')
    state.counts = counts
    renderTabs()
    renderEnvSwitch()
  } catch (error) {
    console.error(error)
  }
}

async function loadMessages({ reset }) {
  if (state.loading) return
  state.loading = true
  const feed = $('feed')
  feed.setAttribute('aria-busy', 'true')
  const { category, env } = state
  const params = new URLSearchParams({ category, env, limit: '50' })
  if (!reset && state.messages.length > 0) {
    params.set('before', String(state.messages[state.messages.length - 1].id))
  }
  try {
    const { messages, hasMore } = await api(`/api/messages?${params}`)
    // La route a pu changer pendant le chargement.
    if (category !== state.category || env !== state.env) return
    state.messages = reset ? messages : state.messages.concat(messages)
    state.hasMore = hasMore
    if (reset) state.newIds.clear()
    renderFeed()
  } catch (error) {
    console.error(error)
    if (reset) {
      state.messages = []
      state.hasMore = false
      renderFeed(`Impossible de charger les notifications (${error.message}).`)
    }
  } finally {
    state.loading = false
    feed.setAttribute('aria-busy', 'false')
  }
}

// ---------------------------------------------------------------- temps réel

function setStatus(status, label) {
  const element = $('status')
  element.dataset.state = status
  element.querySelector('.status-label').textContent = label
}

function connectEvents() {
  const source = new EventSource('/api/events')
  state.eventSource = source
  source.onopen = () => {
    setStatus('online', 'Temps réel')
    if (state.wasOffline) {
      state.wasOffline = false
      loadCounts()
      loadMessages({ reset: true })
    }
  }
  source.onerror = () => {
    state.wasOffline = true
    setStatus('offline', 'Reconnexion…')
  }
  source.addEventListener('notification', event => {
    const message = JSON.parse(event.data)
    bumpCount(message.category, message.env)
    if (message.category === state.category && message.env === state.env) {
      state.messages.unshift(message)
      state.newIds.add(message.id)
      renderFeed()
    }
  })
}

function bumpCount(category, env) {
  const entry = ((state.counts[category] ??= {})[env] ??= { total: 0, recent: 0 })
  entry.total += 1
  entry.recent += 1
  renderTabs()
  renderEnvSwitch()
}

// ---------------------------------------------------------------- rendu

function recentCount(category, env) {
  return state.counts[category]?.[env]?.recent ?? 0
}

function renderTabs() {
  const tabs = $('tabs')
  tabs.replaceChildren(
    ...state.config.categories.map(category => {
      const button = el('button', {
        className: 'tab',
        type: 'button',
        role: 'tab',
        'aria-selected': String(category.id === state.category)
      })
      button.append(
        el('span', { className: 'tab-icon', 'aria-hidden': 'true' }, category.icon),
        el('span', { className: 'tab-label' }, category.label)
      )
      const recent = state.config.envs.reduce(
        (sum, env) => sum + recentCount(category.id, env),
        0
      )
      if (recent > 0) {
        button.append(
          el(
            'span',
            { className: 'badge', title: `${recent} sur les dernières 24 h` },
            String(recent)
          )
        )
      }
      // Chaque onglet s'ouvre sur l'environnement par défaut (Prod).
      button.addEventListener('click', () =>
        navigate(category.id, state.config.defaultEnv)
      )
      return button
    })
  )
  $('category-description').textContent = categoryOf(state.category).description
}

function renderEnvSwitch() {
  $('env-switch').replaceChildren(
    ...state.config.envs.map(env => {
      const button = el('button', {
        className: 'env-option',
        type: 'button',
        'aria-pressed': String(env === state.env)
      })
      button.append(el('span', {}, ENV_LABELS[env] ?? env))
      const recent = recentCount(state.category, env)
      if (recent > 0) {
        button.append(
          el(
            'span',
            { className: 'badge badge-soft', title: `${recent} sur les dernières 24 h` },
            String(recent)
          )
        )
      }
      button.addEventListener('click', () => navigate(state.category, env))
      return button
    })
  )
}

function currentHookUrl() {
  return state.config.hooks[state.category]?.[state.env] ?? ''
}

function renderHookPanel() {
  const url = currentHookUrl()
  $('hook-target').textContent = `· ${categoryOf(state.category).label} · ${ENV_LABELS[state.env]}`
  $('hook-url').value = url
  const example = {
    username: 'Test',
    text: '### Exemple\n| Statut | :white_check_mark: |\n|:--|:--|\n| job | ok |'
  }
  $('hook-curl').textContent =
    `curl -X POST '${url}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(example)}'`
}

function renderFeed(errorText) {
  const feed = $('feed')
  const nodes = []

  if (errorText) {
    nodes.push(el('div', { className: 'empty empty-error' }, errorText))
  } else if (state.messages.length === 0) {
    const empty = el('div', { className: 'empty' })
    empty.append(
      el('p', { className: 'empty-title' }, 'Aucune notification pour le moment.'),
      el(
        'p',
        {},
        `Configurez l'application émettrice avec l'URL du webhook ${categoryOf(state.category).label} · ${ENV_LABELS[state.env]}.`
      )
    )
    const button = el('button', { className: 'btn', type: 'button' }, 'Voir l’URL du webhook')
    button.addEventListener('click', () => toggleHookPanel(true))
    empty.append(button)
    nodes.push(empty)
  } else {
    let currentDay = null
    for (const message of state.messages) {
      const date = new Date(message.receivedAt)
      const dayKey = dayKeyFormat.format(date)
      if (dayKey !== currentDay) {
        currentDay = dayKey
        nodes.push(el('h2', { className: 'day-separator' }, capitalize(dayFormat.format(date))))
      }
      nodes.push(renderMessage(message, date))
    }
  }

  feed.replaceChildren(...nodes)
  const loadMore = $('load-more')
  loadMore.hidden = !state.hasMore
}

function renderMessage(message, date) {
  const category = categoryOf(message.category)
  const article = el('article', {
    className: `message${state.newIds.has(message.id) ? ' is-new' : ''}`,
    'data-id': String(message.id)
  })

  const avatar = el('div', { className: 'avatar', 'aria-hidden': 'true' })
  const fallbackIcon = message.iconEmoji ?? category.icon
  if (message.iconUrl) {
    const image = el('img', { src: message.iconUrl, alt: '', loading: 'lazy' })
    // Image inaccessible (réseau, URL morte) : on retombe sur l'icône de catégorie.
    image.addEventListener('error', () => {
      avatar.textContent = fallbackIcon
    })
    avatar.append(image)
  } else {
    avatar.textContent = fallbackIcon
  }

  const body = el('div', { className: 'message-body' })
  const head = el('header', { className: 'message-head' })
  head.append(
    el('span', { className: 'author' }, message.username ?? category.label),
    el(
      'time',
      { dateTime: message.receivedAt, title: fullFormat.format(date) },
      timeFormat.format(date)
    )
  )
  body.append(head)

  const hasContent = message.html || message.attachments.length > 0
  if (message.html) {
    body.append(markdown(message.html))
  }
  if (message.attachments.length > 0) {
    const list = el('div', { className: 'attachments' })
    for (const attachment of message.attachments) list.append(renderAttachment(attachment))
    body.append(list)
  }

  const rawJson = JSON.stringify(message.raw, null, 2)
  if (!hasContent) {
    body.append(
      el('p', { className: 'raw-notice' }, 'Payload sans champ text ni attachments, affiché brut :'),
      el('pre', { className: 'raw-json' }, rawJson)
    )
  } else {
    const details = el('details', { className: 'raw' })
    details.append(el('summary', {}, 'Payload brut'), el('pre', { className: 'raw-json' }, rawJson))
    body.append(details)
  }

  article.append(avatar, body)
  return article
}

function renderAttachment(attachment) {
  const box = el('div', { className: 'attachment' })
  if (attachment.color) box.style.borderLeftColor = attachment.color

  if (attachment.pretextHtml) box.append(markdown(attachment.pretextHtml, 'attachment-pretext'))

  if (attachment.authorName) {
    const author = el('div', { className: 'attachment-author' })
    if (attachment.authorIcon) author.append(el('img', { src: attachment.authorIcon, alt: '' }))
    author.append(
      attachment.authorLink
        ? el('a', { href: attachment.authorLink, target: '_blank', rel: 'noopener noreferrer' }, attachment.authorName)
        : el('span', {}, attachment.authorName)
    )
    box.append(author)
  }

  if (attachment.titleHtml) {
    const title = el('div', { className: 'attachment-title' })
    if (attachment.titleLink) {
      const link = el('a', { href: attachment.titleLink, target: '_blank', rel: 'noopener noreferrer' })
      link.innerHTML = attachment.titleHtml
      title.append(link)
    } else {
      title.innerHTML = attachment.titleHtml
    }
    box.append(title)
  }

  if (attachment.textHtml) box.append(markdown(attachment.textHtml, 'attachment-text'))

  if (attachment.fields.length > 0) {
    const fields = el('dl', { className: 'fields' })
    for (const field of attachment.fields) {
      const item = el('div', { className: `field${field.short ? ' is-short' : ''}` })
      if (field.title) item.append(el('dt', {}, field.title))
      const value = el('dd')
      if (field.valueHtml) value.append(markdown(field.valueHtml))
      item.append(value)
      fields.append(item)
    }
    box.append(fields)
  }

  if (attachment.imageUrl) {
    box.append(el('img', { className: 'attachment-image', src: attachment.imageUrl, alt: '', loading: 'lazy' }))
  }
  if (attachment.footer) box.append(el('div', { className: 'attachment-footer' }, attachment.footer))
  return box
}

/** Le HTML vient du serveur, déjà assaini (sanitize-html). */
function markdown(html, extraClass = '') {
  const container = el('div', { className: `markdown ${extraClass}`.trim() })
  container.innerHTML = html
  return container
}

function el(tag, attributes = {}, text) {
  const element = document.createElement(tag)
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'className') element.className = value
    else if (name === 'dateTime') element.dateTime = value
    else element.setAttribute(name, value)
  }
  if (text !== undefined) element.textContent = text
  return element
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

// ---------------------------------------------------------------- interactions

function toggleHookPanel(force) {
  const panel = $('hook-panel')
  const open = force ?? panel.hidden
  panel.hidden = !open
  $('toggle-hook').setAttribute('aria-expanded', String(open))
  if (open) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

async function copyHookUrl() {
  const input = $('hook-url')
  const button = $('copy-hook')
  try {
    await navigator.clipboard.writeText(input.value)
  } catch {
    input.select()
    document.execCommand('copy')
  }
  button.textContent = 'Copié !'
  setTimeout(() => (button.textContent = 'Copier'), 1500)
}

// ---------------------------------------------------------------- démarrage

async function main() {
  try {
    await loadConfig()
  } catch (error) {
    $('feed').replaceChildren(
      el('div', { className: 'empty empty-error' }, `Impossible de joindre le serveur (${error.message}).`)
    )
    return
  }
  $('toggle-hook').addEventListener('click', () => toggleHookPanel())
  $('copy-hook').addEventListener('click', copyHookUrl)
  $('load-more').addEventListener('click', () => loadMessages({ reset: false }))
  window.addEventListener('hashchange', applyRoute)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadCounts()
  })

  await Promise.all([loadCounts(), applyRoute()])
  connectEvents()
}

main()
