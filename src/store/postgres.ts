import pg from 'pg'
import { parse as parseConnectionString } from 'pg-connection-string'
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
    id BIGSERIAL PRIMARY KEY,
    category TEXT NOT NULL,
    env TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL,
    username TEXT,
    icon_url TEXT,
    icon_emoji TEXT,
    text TEXT,
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw JSONB
  );
  CREATE INDEX IF NOT EXISTS messages_category_env_id_idx
    ON messages (category, env, id DESC);
  CREATE INDEX IF NOT EXISTS messages_received_at_idx
    ON messages (received_at);
`

const COLUMNS =
  'id, category, env, received_at, username, icon_url, icon_emoji, text, attachments, raw'

interface Row {
  id: string | number
  category: Category
  env: Env
  received_at: Date
  username: string | null
  icon_url: string | null
  icon_emoji: string | null
  text: string | null
  attachments: Attachment[]
  raw: unknown
}

export class PostgresStore implements Store {
  private readonly pool: pg.Pool

  constructor(databaseUrl: string, ssl: boolean) {
    // On passe les champs un par un : avec `connectionString`, le `sslmode`
    // de l'URL Scalingo écraserait notre configuration SSL.
    const parsed = parseConnectionString(databaseUrl)
    this.pool = new pg.Pool({
      host: parsed.host ?? undefined,
      port: parsed.port ? Number(parsed.port) : undefined,
      user: parsed.user,
      password: parsed.password,
      database: parsed.database ?? undefined,
      ssl: ssl ? { rejectUnauthorized: false } : false,
      max: 5,
      application_name: 'pass-emploi-dashboard'
    })
  }

  async init(): Promise<void> {
    await this.pool.query(SCHEMA)
  }

  async insert(message: NewMessage): Promise<Message> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO messages
        (category, env, received_at, username, icon_url, icon_emoji, text, attachments, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        message.category,
        message.env,
        message.receivedAt,
        message.username,
        message.iconUrl,
        message.iconEmoji,
        message.text,
        JSON.stringify(message.attachments),
        JSON.stringify(message.raw ?? null)
      ]
    )
    return { ...message, id: Number(rows[0]!.id) }
  }

  async list(query: ListQuery): Promise<Message[]> {
    const { rows } = await this.pool.query<Row>(
      `SELECT ${COLUMNS} FROM messages
       WHERE category = $1 AND env = $2 AND ($3::bigint IS NULL OR id < $3)
       ORDER BY id DESC
       LIMIT $4`,
      [query.category, query.env, query.before ?? null, query.limit]
    )
    return rows.map(toMessage)
  }

  async counts(recentSince: string): Promise<CountRow[]> {
    const { rows } = await this.pool.query<CountRow>(
      `SELECT category, env,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE received_at > $1::timestamptz)::int AS recent
       FROM messages
       GROUP BY category, env`,
      [recentSince]
    )
    return rows
  }

  async purgeBefore(iso: string): Promise<number> {
    const result = await this.pool.query(
      'DELETE FROM messages WHERE received_at < $1::timestamptz',
      [iso]
    )
    return result.rowCount ?? 0
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}

function toMessage(row: Row): Message {
  return {
    id: Number(row.id),
    category: row.category,
    env: row.env,
    receivedAt: new Date(row.received_at).toISOString(),
    username: row.username,
    iconUrl: row.icon_url,
    iconEmoji: row.icon_emoji,
    text: row.text,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    raw: row.raw
  }
}
