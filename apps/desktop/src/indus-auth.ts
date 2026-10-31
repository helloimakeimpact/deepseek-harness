/** Indus Orbit OAuth identity, separate from provider keys and the upstream account. */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type Server } from 'node:http'

const ISSUER = 'https://jpwvgpnbkrktipwhvqss.supabase.co/auth/v1'
const MODEL_ENDPOINT = 'https://jpwvgpnbkrktipwhvqss.supabase.co/functions/v1/io-harness'
const MAX_RESPONSE = 64 * 1024
const ATTEMPT_MS = 5 * 60 * 1000

/** Registered public desktop OAuth client; never a client secret. */
export interface IndusAuthConfig {
  readonly clientId: string
  readonly callbackPort: number
}
/** Renderer-safe identity; bearer credentials never leave the main process. */
export interface IndusIdentity {
  readonly id: string
  readonly email: string
}
/** Safe sign-in state for the isolated native window. */
export type IndusAuthState = 'unconfigured' | 'signed-out' | 'waiting' | 'signed-in' | 'failed'
/** Main-process encrypted refresh-token storage. */
export interface IndusTokenStore {
  read(): Promise<string | undefined>
  write(refreshToken: string): Promise<void>
  clear(): Promise<void>
}
/** Validates a public client configuration; absent configuration keeps sign-in closed. */
export function indusAuthConfig(environment: NodeJS.ProcessEnv): IndusAuthConfig | undefined {
  const clientId = environment.DSH_CLIENT_INDUS_OAUTH_CLIENT_ID
  if (clientId === undefined || clientId === '') return undefined
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(clientId))
    throw new Error('Indus Orbit OAuth client ID must be a UUID')
  const callbackPort = Number(environment.DSH_CLIENT_INDUS_OAUTH_CALLBACK_PORT ?? '43189')
  if (!Number.isSafeInteger(callbackPort) || callbackPort < 1024 || callbackPort > 65535)
    throw new Error('Indus Orbit callback port is invalid')
  return Object.freeze({ clientId, callbackPort })
}
/** Creates PKCE material retained solely by the native main process. */
export function indusPkce() {
  const verifier = randomBytes(32).toString('base64url')
  return {
    verifier,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
    state: randomBytes(32).toString('base64url'),
  }
}
/** Rejects malformed, duplicate, unsolicited and mismatched callback parameters. */
function parseIndusCallback(input: string, state: string): { code: string } | { denied: true } | undefined {
  if (input.length > 4096) return undefined
  if (!input.startsWith('/indus-auth/callback?')) return undefined
  let url: URL
  try {
    url = new URL(input, 'http://127.0.0.1')
  } catch (_invalidCallback: unknown) {
    return undefined
  }
  if (url.pathname !== '/indus-auth/callback' || url.hash) return undefined
  for (const name of url.searchParams.keys())
    if (!['state', 'code', 'error', 'error_description'].includes(name) || url.searchParams.getAll(name).length !== 1)
      return undefined
  const received = url.searchParams.get('state') ?? ''
  if (
    !/^[A-Za-z0-9_-]{43}$/u.test(received) ||
    received.length !== state.length ||
    !timingSafeEqual(Buffer.from(received), Buffer.from(state))
  )
    return undefined
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  if (error !== null) return code === null && /^[a-z_]{1,80}$/u.test(error) ? { denied: true } : undefined
  if (url.searchParams.has('error_description')) return undefined
  return code !== null && /^[\x21-\x7e]{1,2048}$/u.test(code) ? { code } : undefined
}
/** Returns only a successful, state-bound authorization code. */
export function indusAuthorizationCode(input: string, state: string): string | undefined {
  const result = parseIndusCallback(input, state)
  return result !== undefined && 'code' in result ? result.code : undefined
}

/** Owns one cancellable sign-in, refresh lease and encrypted native refresh credential. */
export class IndusAuth {
  #state: IndusAuthState
  #identity: IndusIdentity | undefined
  #refreshToken: string | undefined
  #accessToken: string | undefined
  #accessExpiresAt = 0
  #server: Server | undefined
  #timer: ReturnType<typeof setTimeout> | undefined
  #refreshTimer: ReturnType<typeof setTimeout> | undefined
  #request = new AbortController()
  #generation = 0
  #disposed = false
  #storageQueue: Promise<void> = Promise.resolve()
  #signingOut: Promise<void> | undefined
  #exchange: Promise<void> = Promise.resolve()
  readonly #config: IndusAuthConfig | undefined
  readonly #store: IndusTokenStore
  readonly #open: (url: string) => Promise<unknown>
  readonly #notify: (state: IndusAuthState) => void
  readonly #lost: () => Promise<void>
  readonly #stop: () => Promise<void>
  readonly #fetch: typeof fetch

  constructor(options: {
    config: IndusAuthConfig | undefined
    store: IndusTokenStore
    open: (url: string) => Promise<unknown>
    notify: (state: IndusAuthState) => void
    lost: () => Promise<void>
    stop: () => Promise<void>
    fetch?: typeof fetch
  }) {
    this.#config = options.config === undefined ? undefined : Object.freeze({ ...options.config })
    this.#store = options.store
    this.#open = options.open
    this.#notify = options.notify
    this.#lost = options.lost
    this.#stop = options.stop
    this.#fetch = options.fetch ?? fetch
    this.#state = this.#config === undefined ? 'unconfigured' : 'signed-out'
  }
  get state(): IndusAuthState {
    return this.#state
  }
  get identity(): IndusIdentity | undefined {
    return this.#identity
  }
  #isCurrent(generation: number): boolean {
    return !this.#disposed && generation === this.#generation
  }
  #set(state: IndusAuthState): void {
    this.#state = state
    this.#notify(state)
  }
  #stopAttempt(): void {
    clearTimeout(this.#timer)
    this.#timer = undefined
    this.#server?.close()
    this.#server = undefined
    this.#request.abort()
    this.#request = new AbortController()
    this.#generation++
  }
  async #json(path: string, init: RequestInit): Promise<Record<string, unknown>> {
    const response = await this.#fetch(`${ISSUER}${path}`, {
      ...init,
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.any([this.#request.signal, AbortSignal.timeout(15000)]),
    })
    if (!response.ok || response.body === null) {
      await response.body?.cancel()
      throw new Error('Indus Orbit authentication request failed')
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let bytes = 0
    try {
      while (true) {
        const part = await reader.read()
        if (part.done) break
        bytes += part.value.byteLength
        if (bytes > MAX_RESPONSE) throw new Error('Indus Orbit authentication response exceeds limit')
        chunks.push(part.value)
      }
    } finally {
      await reader.cancel().catch((_closedResponse: unknown) => undefined)
      reader.releaseLock()
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      throw new Error('Indus Orbit authentication response is invalid')
    return value as Record<string, unknown>
  }
  async #tokens(body: URLSearchParams, generation: number, expectedUser?: string): Promise<void> {
    const requestedAt = Date.now()
    const token = await this.#json('/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (
      typeof token.access_token !== 'string' ||
      token.access_token.length === 0 ||
      token.access_token.length > 16384 ||
      typeof token.refresh_token !== 'string' ||
      token.refresh_token.length === 0 ||
      token.refresh_token.length > 4096 ||
      typeof token.expires_in !== 'number' ||
      !Number.isSafeInteger(token.expires_in) ||
      token.expires_in < 60 ||
      token.expires_in > 86400 ||
      token.token_type !== 'bearer'
    )
      throw new Error('Indus Orbit authentication tokens are invalid')
    if (!this.#isCurrent(generation)) return
    const user = await this.#json('/oauth/userinfo', { headers: { authorization: `Bearer ${token.access_token}` } })
    if (
      typeof user.sub !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(user.sub) ||
      typeof user.email !== 'string' ||
      user.email.length === 0 ||
      user.email.length > 255 ||
      user.email_verified !== true ||
      (expectedUser !== undefined && user.sub !== expectedUser)
    )
      throw new Error('Indus Orbit identity could not be verified')
    if (!this.#isCurrent(generation)) return
    const refresh = token.refresh_token
    const write = this.#storageQueue.then(async () => {
      if (this.#isCurrent(generation)) await this.#store.write(refresh)
    })
    this.#storageQueue = write.catch((_writeFailed: unknown) => undefined)
    await write
    if (!this.#isCurrent(generation)) return
    this.#refreshToken = token.refresh_token
    this.#accessToken = token.access_token
    this.#accessExpiresAt = requestedAt + token.expires_in * 1000
    this.#identity = Object.freeze({ id: user.sub, email: user.email })
    this.#set('signed-in')
    clearTimeout(this.#refreshTimer)
    this.#refreshTimer = setTimeout(
      () => {
        void this.#refresh()
      },
      Math.max(0, this.#accessExpiresAt - Date.now() - 45_000),
    )
    this.#refreshTimer.unref()
  }
  async #refresh(): Promise<void> {
    const generation = this.#generation
    const refresh = this.#refreshToken
    if (refresh === undefined || this.#config === undefined) return
    try {
      await this.#tokens(
        new URLSearchParams({ grant_type: 'refresh_token', client_id: this.#config.clientId, refresh_token: refresh }),
        this.#generation,
        this.#identity?.id,
      )
    } catch (_refreshUnavailable: unknown) {
      if (this.#isCurrent(generation)) await this.signOut()
    }
  }
  /** Restores only this configured client's encrypted identity; failure remains signed out. */
  async restore(): Promise<void> {
    if (this.#config === undefined || this.#disposed || this.#signingOut !== undefined) return
    const generation = this.#generation
    try {
      const refresh = await this.#store.read()
      if (refresh !== undefined && this.#isCurrent(generation))
        await this.#tokens(
          new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: this.#config.clientId,
            refresh_token: refresh,
          }),
          generation,
        )
    } catch (_storedSessionUnavailable: unknown) {
      if (!this.#isCurrent(generation)) return
      const clear = this.#storageQueue.then(async () => {
        if (this.#isCurrent(generation)) await this.#store.clear()
      })
      this.#storageQueue = clear.catch((_clearFailed: unknown) => undefined)
      await clear
      if (this.#isCurrent(generation)) this.#set('signed-out')
    }
  }
  /** Opens the registered Indus Orbit authorization flow; no provider credential is read. */
  async start(): Promise<void> {
    if (this.#config === undefined || this.#disposed || this.#signingOut !== undefined || this.#state === 'signed-in' || this.#state === 'waiting') return
    this.#stopAttempt()
    const generation = this.#generation
    const pkce = indusPkce()
    const config = this.#config
    let callbackPort = config.callbackPort
    let redirectUri = `http://127.0.0.1:${String(callbackPort)}/indus-auth/callback`
    const server = createServer((request, response) => {
      const result =
        request.method === 'GET' &&
        request.socket.remoteAddress === '127.0.0.1' &&
        request.headers.host === `127.0.0.1:${String(callbackPort)}` &&
        request.headers.origin === undefined &&
        request.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'host').length === 1 &&
        request.headers['transfer-encoding'] === undefined &&
        (request.headers['content-length'] === undefined || request.headers['content-length'] === '0')
          ? parseIndusCallback(request.url ?? '', pkce.state)
          : undefined
      response.writeHead(result === undefined ? 400 : 200, {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'content-security-policy': "default-src 'none'",
        'x-content-type-options': 'nosniff',
      })
      response.end(
        result === undefined
          ? 'Sign-in was not accepted. Return to I/O Harness.'
          : 'Return to I/O Harness to finish signing in.',
      )
      if (result === undefined || !this.#isCurrent(generation)) return
      this.#stopAttempt()
      if ('denied' in result) {
        this.#set('signed-out')
        return
      }
      const exchangeGeneration = this.#generation
      this.#exchange = this.#tokens(
        new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: config.clientId,
          redirect_uri: redirectUri,
          code: result.code,
          code_verifier: pkce.verifier,
        }),
        exchangeGeneration,
      ).catch((_exchangeFailed: unknown) => {
        if (exchangeGeneration === this.#generation) this.#set('failed')
      })
    })
    server.maxConnections = 8
    server.headersTimeout = 5000
    server.requestTimeout = 5000
    server.maxHeadersCount = 16
    this.#server = server
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(config.callbackPort, '127.0.0.1', resolve)
      })
      if (!this.#isCurrent(generation)) {
        server.close()
        return
      }
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('Indus callback listener unavailable')
      callbackPort = address.port
      redirectUri = `http://127.0.0.1:${String(callbackPort)}/indus-auth/callback`
      this.#set('waiting')
      this.#timer = setTimeout(() => {
        if (this.#isCurrent(generation)) {
          void this.cancel()
          this.#set('failed')
        }
      }, ATTEMPT_MS)
      this.#timer.unref()
      const url = new URL(`${ISSUER}/oauth/authorize`)
      for (const [key, value] of Object.entries({
        response_type: 'code',
        client_id: config.clientId,
        redirect_uri: redirectUri,
        state: pkce.state,
        code_challenge: pkce.challenge,
        code_challenge_method: 'S256',
        scope: 'openid email profile',
        prompt: 'consent',
      }))
        url.searchParams.set(key, value)
      await this.#open(url.href)
    } catch (_authorizationUnavailable: unknown) {
      if (this.#isCurrent(generation)) {
        this.#stopAttempt()
        this.#set('failed')
      }
    }
  }
  /** Cancels this attempt; late callbacks and token replies cannot restore it. */
  async cancel(): Promise<void> {
    this.#stopAttempt()
    if (this.#state !== 'signed-in') this.#set(this.#config === undefined ? 'unconfigured' : 'signed-out')
    await this.#exchange
  }
  /**
   * Send one native model operation using the main-process identity only.
   * @param path - Allowlisted wire operation under the pinned I/O service.
   * @param body - Serialized chat request, or undefined for model discovery.
   * @param signal - Caller cancellation; sign-out/disposal also aborts the request and response stream.
   * @param requestId - Unique paid-attempt id; absent for discovery.
   * @returns The gateway response without exposing a bearer credential to its caller.
   */
  async fetchModel(path: '/v1/models' | '/v1/chat/completions', body: string | undefined, signal: AbortSignal, requestId?: string): Promise<Response> {
    const token = this.#accessToken
    if (this.#disposed || this.#state !== 'signed-in' || token === undefined || Date.now() >= this.#accessExpiresAt)
      throw new Error('Indus Orbit sign-in is required')
    if ((path === '/v1/models') !== (body === undefined)) throw new Error('Invalid I/O model operation')
    const headers: Record<string, string> = { authorization: `Bearer ${token}` }
    if (body !== undefined) {
      if (requestId === undefined || !/^[A-Za-z0-9_-]{16,80}$/u.test(requestId))
        throw new Error('I/O model request requires a unique attempt id')
      headers['content-type'] = 'application/json'
      headers['Idempotency-Key'] = requestId
    }
    return this.#fetch(`${MODEL_ENDPOINT}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      ...body === undefined ? {} : { body },
      redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
      signal: AbortSignal.any([signal, this.#request.signal]),
    })
  }
  /** Invalidates this device immediately; exit waits for Host shutdown and credential removal. */
  signOut(): Promise<void> {
    if (this.#signingOut !== undefined) return this.#signingOut
    const operation = Promise.withResolvers<void>()
    this.#signingOut = operation.promise
    void this.#finishSignOut().then(() => {
      this.#signingOut = undefined
      operation.resolve()
    }, (error: unknown) => {
      this.#signingOut = undefined
      operation.reject(error)
    })
    return operation.promise
  }
  async #finishSignOut(): Promise<void> {
    const hadIdentity = this.#identity !== undefined
    this.#stopAttempt()
    clearTimeout(this.#refreshTimer)
    this.#refreshToken = undefined
    this.#accessToken = undefined
    this.#accessExpiresAt = 0
    this.#identity = undefined
    // Host admission closes before asynchronous cleanup; UI completion is notified below.
    this.#state = 'signed-out'
    const clear = this.#storageQueue.then(() => this.#store.clear())
    this.#storageQueue = clear.catch((_clearFailed: unknown) => undefined)
    let stopped: Promise<void>
    try {
      stopped = hadIdentity ? this.#stop() : Promise.resolve()
    } catch (error) {
      stopped = Promise.reject(error instanceof Error ? error : new Error('Indus Orbit Host shutdown failed'))
    }
    const outcomes = await Promise.allSettled([clear, stopped])
    const errors: unknown[] = []
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') {
        const reason: unknown = outcome.reason
        errors.push(reason)
      }
    }
    this.#set(errors.length === 0 ? 'signed-out' : 'failed')
    try { if (hadIdentity && outcomes[1].status === 'fulfilled') await this.#lost() } catch (error) { errors.push(error) }
    if (errors.length === 1) throw errors[0]
    if (errors.length > 1) throw new AggregateError(errors, 'Indus Orbit sign-out did not finish cleanly')
  }
  /** Stops listeners and refresh work without deleting the user's saved session. */
  dispose(): void {
    this.#disposed = true
    this.#stopAttempt()
    clearTimeout(this.#refreshTimer)
    this.#refreshToken = undefined
    this.#accessToken = undefined
    this.#accessExpiresAt = 0
  }
}
