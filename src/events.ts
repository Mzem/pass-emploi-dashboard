import type { Response } from 'express'

/** Diffusion temps réel vers les navigateurs ouverts (Server-Sent Events). */
export class EventHub {
  private readonly clients = new Set<Response>()
  private readonly heartbeat: NodeJS.Timeout

  constructor(heartbeatMs = 25_000) {
    // Un commentaire SSE régulier évite la fermeture des connexions inactives
    // par le routeur Scalingo.
    this.heartbeat = setInterval(() => this.write(': ping\n\n'), heartbeatMs)
    this.heartbeat.unref()
  }

  get size(): number {
    return this.clients.size
  }

  subscribe(res: Response): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    })
    res.write('retry: 3000\n\n')
    this.clients.add(res)
    res.on('close', () => {
      this.clients.delete(res)
    })
  }

  publish(event: string, data: unknown): void {
    this.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  close(): void {
    clearInterval(this.heartbeat)
    for (const client of this.clients) client.end()
    this.clients.clear()
  }

  private write(chunk: string): void {
    for (const client of this.clients) {
      if (client.writableEnded || client.destroyed) {
        this.clients.delete(client)
        continue
      }
      client.write(chunk)
    }
  }
}
