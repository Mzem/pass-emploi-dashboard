import { formatScalingoEvent, isScalingoEvent } from './scalingo.js'
import type { FormattedPayload, FormatterOptions } from './types.js'

export type { FormattedPayload, FormatterOptions } from './types.js'

/**
 * Reconnaît les payloads non Mattermost de sources connues et les convertit en
 * message affichable. Renvoie null si le payload n'est pas reconnu (affichage brut).
 */
export function formatPayload(
  raw: unknown,
  options: FormatterOptions
): FormattedPayload | null {
  if (isScalingoEvent(raw)) {
    return formatScalingoEvent(raw, options.scalingoRegion)
  }
  return null
}
