import { createHash, timingSafeEqual } from 'node:crypto'
import type { RequestHandler } from 'express'

/** HTTP Basic Auth pour le front et l'API (les webhooks n'y sont pas soumis). */
export function basicAuth(user: string, password: string): RequestHandler {
  return (req, res, next) => {
    const header = req.headers.authorization ?? ''
    if (header.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
      const separator = decoded.indexOf(':')
      if (
        separator > 0 &&
        safeEqual(decoded.slice(0, separator), user) &&
        safeEqual(decoded.slice(separator + 1), password)
      ) {
        next()
        return
      }
    }
    res.set(
      'WWW-Authenticate',
      'Basic realm="Notifications Pass Emploi", charset="UTF-8"'
    )
    res.status(401).type('text').send('Authentification requise')
  }
}

function safeEqual(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a).digest()
  const hashB = createHash('sha256').update(b).digest()
  return timingSafeEqual(hashA, hashB)
}
