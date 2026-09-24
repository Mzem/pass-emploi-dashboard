import type { HookTarget } from './config.js'
import type { Attachment, AttachmentField, NewMessage } from './store/types.js'

const MAX_TEXT_LENGTH = 100_000
const MAX_USERNAME_LENGTH = 100
const MAX_ATTACHMENTS = 20
const MAX_FIELDS = 50

/** Couleurs nommées acceptées par Slack / Mattermost. */
const NAMED_COLORS: Record<string, string> = {
  good: '#2EB886',
  warning: '#DAA038',
  danger: '#A30200'
}

/**
 * Interprète le corps d'un webhook entrant, comme Mattermost :
 * JSON (Content-Type application/json ou absent) ou formulaire avec un champ `payload`.
 */
export function parseWebhookBody(
  contentType: string | undefined,
  body: string
): unknown {
  const clean = body.replace(/\u0000/g, '')
  const mediaType = (contentType ?? '').split(';')[0]!.trim().toLowerCase()

  if (mediaType === 'application/x-www-form-urlencoded') {
    const params = new URLSearchParams(clean)
    const payload = params.get('payload')
    if (payload !== null) return parseJsonOrText(payload)
    return Object.fromEntries(params)
  }

  return parseJsonOrText(clean)
}

function parseJsonOrText(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) return {}
  try {
    return JSON.parse(trimmed)
  } catch {
    return { text: value }
  }
}

/** Construit le message à stocker à partir d'un payload Mattermost / Slack (ou autre). */
export function toNewMessage(
  target: HookTarget,
  payload: unknown,
  receivedAt: string = new Date().toISOString()
): NewMessage {
  const p: Record<string, unknown> = isPlainObject(payload)
    ? payload
    : typeof payload === 'string'
      ? { text: payload }
      : {}

  return {
    category: target.category,
    env: target.env,
    receivedAt,
    username: truncate(
      firstString(p.username, p.user_name),
      MAX_USERNAME_LENGTH
    ),
    iconUrl: httpUrl(p.icon_url),
    iconEmoji: firstString(p.icon_emoji),
    text: truncate(
      firstString(p.text, p.message, p.content, p.markdown),
      MAX_TEXT_LENGTH
    ),
    attachments: normalizeAttachments(p.attachments),
    raw: payload
  }
}

function normalizeAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isPlainObject)
    .slice(0, MAX_ATTACHMENTS)
    .map(normalizeAttachment)
}

function normalizeAttachment(a: Record<string, unknown>): Attachment {
  return {
    fallback: truncate(firstString(a.fallback), MAX_TEXT_LENGTH),
    color: normalizeColor(a.color),
    pretext: truncate(firstString(a.pretext), MAX_TEXT_LENGTH),
    authorName: truncate(firstString(a.author_name), MAX_USERNAME_LENGTH),
    authorLink: httpUrl(a.author_link),
    authorIcon: httpUrl(a.author_icon),
    title: truncate(firstString(a.title), 1000),
    titleLink: httpUrl(a.title_link),
    text: truncate(firstString(a.text), MAX_TEXT_LENGTH),
    fields: normalizeFields(a.fields),
    imageUrl: httpUrl(a.image_url),
    thumbUrl: httpUrl(a.thumb_url),
    footer: truncate(firstString(a.footer), 1000)
  }
}

function normalizeFields(value: unknown): AttachmentField[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isPlainObject)
    .slice(0, MAX_FIELDS)
    .map(f => ({
      title: truncate(firstString(f.title), 1000),
      value: truncate(stringify(f.value), MAX_TEXT_LENGTH),
      short: f.short === true || f.short === 'true'
    }))
}

function normalizeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const named = NAMED_COLORS[value.trim().toLowerCase()]
  if (named) return named
  const hex = value.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$|^[0-9a-f]{6}$|^[0-9a-f]{8}$/i.test(hex)) {
    return `#${hex.toUpperCase()}`
  }
  return null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return null
}

function stringify(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function truncate(value: string | null, max: number): string | null {
  if (value === null) return null
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function httpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : null
  } catch {
    return null
  }
}
