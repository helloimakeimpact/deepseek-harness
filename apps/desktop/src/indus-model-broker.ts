/** Main-process model proxy; only a private Host capability crosses the local socket. */
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { once } from 'node:events'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

/** Ephemeral Host-only connection. Never persist or send it to a renderer. */
export interface IndusModelConnection {
  readonly baseURL: string
  readonly capability: string
}

/** Bounded model proxy policy, supplied by the owning application. */
export interface IndusModelBrokerPolicy {
  readonly requestBytes: number
  readonly responseBytes: number
  readonly concurrentRequests: number
  readonly requestTimeoutMs: number
}

type ModelOperation = '/v1/models' | '/v1/chat/completions'

/** Owns one loopback listener, its capability and all in-flight model requests. */
export class IndusModelBroker {
  readonly #server = createServer((request, response) => {
    void this.#handle(request, response).catch((_failedRequest: unknown) => {
      if (!response.headersSent) this.#error(response, 502, 'I/O request failed. Check your connection before retrying.')
      else response.destroy()
    })
  })
  readonly #capability = randomBytes(32).toString('base64url')
  readonly #lifetime = new AbortController()
  readonly #pending = new Set<Promise<void>>()
  #connection: IndusModelConnection | undefined
  #closed = false
  #closing: Promise<void> | undefined
  #starting: Promise<IndusModelConnection> | undefined

  /**
   * @param forward - Main-process-only authenticated gateway transport; it honors cancellation.
   * @param policy - Explicit request, response, concurrency and lifetime limits.
   */
  constructor(
    private readonly forward: (
      path: ModelOperation, body: string | undefined, signal: AbortSignal, requestId?: string,
    ) => Promise<Response>,
    private readonly policy: IndusModelBrokerPolicy,
  ) {
    for (const value of Object.values(policy))
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid I/O broker policy')
    if (policy.requestTimeoutMs > 2_147_483_647) throw new Error('Invalid I/O broker request timeout')
    this.#server.maxHeadersCount = 24
    this.#server.headersTimeout = 10_000
    this.#server.requestTimeout = policy.requestTimeoutMs
  }

  /**
   * Bind once to an OS-allocated loopback port; startup after close is refused.
   * @returns This lifetime's private Host connection after the listener is ready.
   */
  start(): Promise<IndusModelConnection> {
    if (this.#closed) return Promise.reject(new Error('I/O broker is closed'))
    return this.#starting ??= (async () => {
      const ready = once(this.#server, 'listening')
      this.#server.listen(0, '127.0.0.1')
      await ready
      const address = this.#server.address() as AddressInfo
      if (this.#closed) throw new Error('I/O broker is closed')
      this.#connection = Object.freeze({ baseURL: `http://127.0.0.1:${String(address.port)}/v1`, capability: this.#capability })
      return this.#connection
    })()
  }

  #error(response: ServerResponse, status: number, message: string): void {
    response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    response.end(JSON.stringify({ error: { message, type: 'indus_model_error' } }))
  }

  async #handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const connection = this.#connection
    const supplied = request.headers.authorization ?? ''
    const expected = `Bearer ${this.#capability}`
    if (this.#closed || connection === undefined || request.headers.host !== new URL(connection.baseURL).host
      || request.headers.origin !== undefined || request.headers['sec-fetch-site'] !== undefined
      || supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      this.#error(response, 403, 'This I/O connection is private to its desktop Host.')
      request.resume()
      return
    }
    const path = request.url
    if (!((path === '/v1/models' && request.method === 'GET')
      || (path === '/v1/chat/completions' && request.method === 'POST'))
      || (request.method === 'POST' && request.headers['content-type']?.split(';')[0]?.trim() !== 'application/json')
      || (request.method === 'GET' && (request.headers['transfer-encoding'] !== undefined || Number(request.headers['content-length'] ?? 0) !== 0))) {
      this.#error(response, 400, 'Unsupported I/O model operation.')
      request.resume()
      return
    }
    if (this.#pending.size >= this.policy.concurrentRequests) {
      this.#error(response, 429, 'Too many concurrent I/O requests. Wait for the current work to finish.')
      request.resume()
      return
    }
    const cancelled = new AbortController()
    const abort = (): void => { cancelled.abort() }
    request.once('aborted', abort)
    response.once('close', abort)
    const signal = AbortSignal.any([cancelled.signal, this.#lifetime.signal, AbortSignal.timeout(this.policy.requestTimeoutMs)])
    const onAbort = (): void => { response.destroy() }
    signal.addEventListener('abort', onAbort, { once: true })
    const operation = this.#transfer(request, response, path, signal)
    this.#pending.add(operation)
    try { await operation }
    finally {
      this.#pending.delete(operation)
      request.off('aborted', abort)
      response.off('close', abort)
      signal.removeEventListener('abort', onAbort)
    }
  }

  async #transfer(request: IncomingMessage, response: ServerResponse, path: ModelOperation, signal: AbortSignal): Promise<void> {
    const chunks: Buffer[] = []
    let bytes = 0
    for await (const chunk of request) {
      const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
      bytes += part.length
      if (bytes > this.policy.requestBytes) {
        this.#error(response, 413, 'I/O request is too large. Reduce the context or attachments.')
        request.resume()
        return
      }
      chunks.push(part)
    }
    if (signal.aborted) return
    const body = path === '/v1/models' ? undefined : Buffer.concat(chunks).toString('utf8')
    // Every HTTP attempt is unique. Neither this proxy nor its SDK may replay an unknown paid outcome.
    const requestId = body === undefined ? undefined : randomBytes(24).toString('base64url')
    const upstream = await this.forward(path, body, signal, requestId)
    const contentType = upstream.headers.get('content-type')?.split(';')[0]?.trim()
    if (upstream.body === null || (contentType !== 'application/json' && contentType !== 'text/event-stream')
      || upstream.status < 200 || upstream.status >= 600 || (path === '/v1/models' && contentType !== 'application/json')) {
      await upstream.body?.cancel()
      throw new Error('Invalid I/O model response')
    }
    const reader = upstream.body.getReader()
    try {
      signal.throwIfAborted()
      const headers: Record<string, string> = { 'content-type': contentType, 'cache-control': 'no-store' }
      for (const name of ['x-io-request-id', 'x-io-receipt-state', 'retry-after']) {
        const value = upstream.headers.get(name)
        if (value !== null) headers[name] = value
      }
      response.writeHead(upstream.status, headers)
      let received = 0
      while (!signal.aborted) {
        const part = await reader.read()
        if (part.done) { response.end(); return }
        received += part.value.byteLength
        if (received > this.policy.responseBytes) throw new Error('I/O response exceeds limit')
        if (!response.write(part.value)) await once(response, 'drain', { signal })
      }
    } finally {
      await reader.cancel().catch((_closedStream: unknown) => undefined)
      reader.releaseLock()
    }
  }

  /**
   * Revoke admission, abort requests and await the listener and transfers stopping.
   * @returns Completion after all owned requests and sockets have stopped.
   */
  close(): Promise<void> {
    return this.#closing ??= (async () => {
      this.#closed = true
      this.#lifetime.abort()
      await this.#starting?.catch((_failedStart: unknown) => undefined)
      if (this.#server.listening) {
        const closed = once(this.#server, 'close')
        this.#server.close()
        this.#server.closeAllConnections()
        await closed
      }
      await Promise.allSettled([...this.#pending])
      this.#connection = undefined
    })()
  }
}
