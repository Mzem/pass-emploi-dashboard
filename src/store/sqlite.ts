import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Category, Env } from '../config.js'
import type {
  Attachment,
  CountRow,
  ListQuery,
  Message,
  NewMessage,
  Store
} from './types.js'

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    env TEXT NOT NULL,
    received_at TEXT NOT NULL,
    username TEXT,
    icon_url TEXT,
    icon_emoji TEXT,
    text TEXT,
    attachments TEXT NOT NULL DEFAULT '[]',
    raw TEXT
  );
  CREATE INDEX IF NOT EXISTS messages_category_env_id_idx
    ON messages (category, env, id DESC);
  CREATE INDEX IF NOT EXISTS messages_received_at_idx
    ON messages (received_at);
`

const COLUMNS =
  'id, category, env, received_at, username, icon_url, icon_emoji, text, attachments, raw'

interface Row {
  id: number | bigint
  category: Category
  env: Env
  received_at: string
  username: string | null
  icon_url: string | null
  icon_emoji: string | null
  text: string | null
  attachments: string
  raw: string | null
}

/** Stockage local (dev) : fichier SQLite, ou ':memory:' pour les tests. */
export class SqliteStore implements Store {
  private readonly db: DatabaseSync

  constructor(file: string) {
    if (file !== ':memory:') {
      mkdirSync(path.dirname(file), { recursive: true })
    }
    this.db = new DatabaseSync(file)
  }

  async init(): Promise<void> {
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec(SCHEMA)
  }

  async insert(message: NewMessage): Promise<Message> {
    const result = this.db
      .prepare(
        `INSERT INTO messages
          (category, env, received_at, username, icon_url, icon_emoji, text, attachments, raw)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        message.category,
        message.env,
        message.receivedAt,
        message.username,
        message.iconUrl,
        message.iconEmoji,
        message.text,
        JSON.stringify(message.attachments),
        JSON.stringify(message.raw ?? null)
      )
    return { ...message, id: Number(result.lastInsertRowid) }
  }

  async list(query: ListQuery): Promise<Message[]> {
    const before = query.before ?? null
    const rows = this.db
      .prepare(
        `SELECT ${COLUMNS} FROM messages
         WHERE category = ? AND env = ? AND (? IS NULL OR id < ?)
         ORDER BY id DESC
         LIMIT ?`
      )
      .all(query.category, query.env, before, before, query.limit) as unknown as Row[]
    return rows.map(toMessage)
  }

  async counts(recentSince: string): Promise<CountRow[]> {
    const rows = this.db
      .prepare(
        `SELECT category, env,
                COUNT(*) AS total,
                SUM(CASE WHEN received_at > ? THEN 1 ELSE 0 END) AS recent
         FROM messages
         GROUP BY category, env`
      )
      .all(recentSince) as unknown as Array<{
      category: Category
      env: Env
      total: number | bigint
      recent: number | bigint | null
    }>
    return rows.map(row => ({
      category: row.category,
      env: row.env,
      total: Number(row.total),
      recent: Number(row.recent ?? 0)
    }))
  }

  async purgeBefore(iso: string): Promise<number> {
    const result = this.db
      .prepare('DELETE FROM messages WHERE received_at < ?')
      .run(iso)
    return Number(result.changes)
  }

  async close(): Promise<void> {
    this.db.close()
  }
}

function toMessage(row: Row): Message {
  return {
    id: Number(row.id),
    category: row.category,
    env: row.env,
    receivedAt: row.received_at,
    username: row.username,
    iconUrl: row.icon_url,
    iconEmoji: row.icon_emoji,
    text: row.text,
    attachments: parseJson<Attachment[]>(row.attachments, []),
    raw: parseJson<unknown>(row.raw, null)
  }
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (value === null) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
