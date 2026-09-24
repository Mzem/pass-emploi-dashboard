import { marked } from 'marked'
import { emojify } from 'node-emoji'
import sanitizeHtml from 'sanitize-html'
import { DEFAULT_SCALINGO_REGION, type Category, type Env } from './config.js'
import { formatPayload, type FormatterOptions } from './formatters/index.js'
import type { Message } from './store/types.js'

marked.use({ gfm: true, breaks: true })

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    'img',
    'del',
    'ins',
    'input',
    'details',
    'summary'
  ],
  allowedAttributes: {
    a: ['href', 'name', 'target', 'rel', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    code: ['class'],
    pre: ['class'],
    input: ['type', 'checked', 'disabled'],
    th: ['align'],
    td: ['align']
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', {
      target: '_blank',
      rel: 'noopener noreferrer'
    })
  }
}

/**
 * Mattermost tolère des tableaux dont les lignes sont indentées (c'est le cas
 * des messages construits par pass-emploi-api avec des template literals) ;
 * en GFM strict, 4 espaces = bloc de code. On retire l'indentation devant "|".
 */
export function normalizeMattermostMarkdown(markdown: string): string {
  return markdown.replace(/^[ \t]+(?=\|)/gm, '')
}

/** Markdown (GFM + emojis :shortcode:) → HTML sûr. */
export function renderMarkdown(markdown: string): string {
  const html = marked.parse(emojify(normalizeMattermostMarkdown(markdown)), {
    async: false
  })
  return sanitizeHtml(html, SANITIZE_OPTIONS)
}

/** Idem, sans balises de bloc (titres, auteurs…). */
export function renderInline(markdown: string): string {
  const html = marked.parseInline(emojify(markdown), { async: false })
  return sanitizeHtml(html, SANITIZE_OPTIONS)
}

export function renderEmoji(shortcode: string | null): string | null {
  if (!shortcode) return null
  const rendered = emojify(shortcode).trim()
  return rendered && rendered !== shortcode.trim() ? rendered : null
}

export interface PresentedField {
  title: string | null
  valueHtml: string | null
  short: boolean
}

export interface PresentedAttachment {
  color: string | null
  pretextHtml: string | null
  authorName: string | null
  authorLink: string | null
  authorIcon: string | null
  titleHtml: string | null
  titleLink: string | null
  textHtml: string | null
  fields: PresentedField[]
  imageUrl: string | null
  thumbUrl: string | null
  footer: string | null
}

export interface PresentedMessage {
  id: number
  category: Category
  env: Env
  receivedAt: string
  username: string | null
  iconUrl: string | null
  /** Emoji rendu (caractère), ou null si le shortcode est inconnu. */
  iconEmoji: string | null
  html: string | null
  attachments: PresentedAttachment[]
  raw: unknown
}

export type PresentOptions = Partial<FormatterOptions>

/**
 * Prépare un message pour le front : markdown rendu, contenu assaini.
 * Un payload sans `text` ni `attachments` mais de source connue (évènement Scalingo…)
 * est mis en forme à la volée depuis le payload brut, ce qui profite aussi à l'historique.
 */
export function presentMessage(
  message: Message,
  options: PresentOptions = {}
): PresentedMessage {
  const formatted =
    message.text === null && message.attachments.length === 0
      ? formatPayload(message.raw, {
          scalingoRegion: options.scalingoRegion ?? DEFAULT_SCALINGO_REGION
        })
      : null
  const text = formatted?.text ?? message.text
  const attachments = formatted?.attachments ?? message.attachments

  return {
    id: message.id,
    category: message.category,
    env: message.env,
    receivedAt: message.receivedAt,
    username: formatted?.username ?? message.username,
    iconUrl: message.iconUrl,
    iconEmoji: renderEmoji(formatted?.iconEmoji ?? message.iconEmoji),
    html: text ? renderMarkdown(text) : null,
    attachments: attachments.map(attachment => ({
      color: attachment.color,
      pretextHtml: attachment.pretext ? renderMarkdown(attachment.pretext) : null,
      authorName: attachment.authorName,
      authorLink: attachment.authorLink,
      authorIcon: attachment.authorIcon,
      titleHtml: attachment.title ? renderInline(attachment.title) : null,
      titleLink: attachment.titleLink,
      textHtml: attachment.text ? renderMarkdown(attachment.text) : null,
      fields: attachment.fields.map(field => ({
        title: field.title,
        valueHtml: field.value ? renderMarkdown(field.value) : null,
        short: field.short
      })),
      imageUrl: attachment.imageUrl,
      thumbUrl: attachment.thumbUrl,
      footer: attachment.footer
    })),
    raw: message.raw
  }
}
