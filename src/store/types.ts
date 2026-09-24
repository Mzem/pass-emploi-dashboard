import type { Category, Env } from '../config.js'

export interface AttachmentField {
  title: string | null
  value: string | null
  short: boolean
}

/** Pièce jointe au format Mattermost / Slack (message attachments). */
export interface Attachment {
  fallback: string | null
  color: string | null
  pretext: string | null
  authorName: string | null
  authorLink: string | null
  authorIcon: string | null
  title: string | null
  titleLink: string | null
  text: string | null
  fields: AttachmentField[]
  imageUrl: string | null
  thumbUrl: string | null
  footer: string | null
}

export interface NewMessage {
  category: Category
  env: Env
  /** Date de réception, ISO 8601 UTC. */
  receivedAt: string
  username: string | null
  iconUrl: string | null
  iconEmoji: string | null
  text: string | null
  attachments: Attachment[]
  /** Payload reçu, tel quel. */
  raw: unknown
}

export interface Message extends NewMessage {
  id: number
}

export interface ListQuery {
  category: Category
  env: Env
  /** Ne renvoyer que les messages d'id strictement inférieur (pagination). */
  before?: number
  limit: number
}

export interface CountRow {
  category: Category
  env: Env
  total: number
  /** Nombre de messages reçus depuis `recentSince`. */
  recent: number
}

export interface Store {
  init(): Promise<void>
  insert(message: NewMessage): Promise<Message>
  /** Messages du plus récent au plus ancien. */
  list(query: ListQuery): Promise<Message[]>
  counts(recentSince: string): Promise<CountRow[]>
  /** Supprime les messages reçus avant la date donnée ; renvoie le nombre supprimé. */
  purgeBefore(iso: string): Promise<number>
  close(): Promise<void>
}
