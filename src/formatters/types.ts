import type { Attachment } from '../store/types.js'

/** Résultat d'un formateur : équivalent d'un payload Mattermost reconstruit depuis un JSON tiers. */
export interface FormattedPayload {
  username: string | null
  iconEmoji: string | null
  text: string | null
  attachments: Attachment[]
}

export interface FormatterOptions {
  /** Région Scalingo, pour les liens vers le dashboard. */
  scalingoRegion: string
}
