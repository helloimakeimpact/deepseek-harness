import { createHash } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { IndusAuth, indusAuthConfig, indusAuthorizationCode, indusPkce } from '../src/indus-auth.ts'

const clientId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
const token = {
  access_token: 'private-access',
  refresh_token: 'rotated-refresh',
  token_type: 'bearer',
  expires_in: 3600,
}
function fixture(fetcher = vi.fn<typeof fetch>(), callbackPort = 43189) {
  const store = {
    read: vi.fn(async (): Promise<string | undefined> => undefined),
    write: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  }
  const changed = vi.fn()
  const lost = vi.fn(async () => undefined)
  const open = vi.fn(async (_url: string) => undefined)
  const auth = new IndusAuth({
    config: { clientId, callbackPort },
    store,
    fetch: fetcher,
    notify: changed,
    lost,
    open,
  })
  onTestFinished(() => {
    auth.dispose()
  })
  return { auth, store, changed, lost, open, fetcher }
}
describe('Indus Orbit native identity', () => {
  it('refuses model access after the token lease expires before a delayed refresh runs', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000)
    onTestFinished(() => { clock.mockRestore() })
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ ...token, expires_in: 60 }))
      .mockResolvedValueOnce(Response.json({ sub: userId, email: 'member@example.test', email_verified: true }))
    const f = fixture(fetcher)
    f.store.read.mockResolvedValue('old-refresh')
    await f.auth.restore()
    clock.mockReturnValue(61_001)
    await expect(f.auth.fetchModel('/v1/models', undefined, new AbortController().signal)).rejects.toThrow('sign-in')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('keeps model bearer credentials in main and pins method, endpoint and attempt identity', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(token))
      .mockResolvedValueOnce(Response.json({ sub: userId, email: 'member@example.test', email_verified: true }))
      .mockResolvedValueOnce(Response.json({ object: 'list', data: [] }))
      .mockResolvedValueOnce(Response.json({ choices: [] }))
    const f = fixture(fetcher)
    f.store.read.mockResolvedValue('old-refresh')
    const signal = new AbortController().signal
    await expect(f.auth.fetchModel('/v1/models', undefined, signal)).rejects.toThrow('sign-in')
    await f.auth.restore()
    await f.auth.fetchModel('/v1/models', undefined, signal)
    const body = '{ "model": "io/harness-primary", "messages": [] }'
    await f.auth.fetchModel('/v1/chat/completions', body, signal, 'unique_attempt_00001')
    expect(fetcher.mock.calls[2]?.[0]).toBe('https://jpwvgpnbkrktipwhvqss.supabase.co/functions/v1/io-harness/v1/models')
    expect(fetcher.mock.calls[3]?.[1]).toMatchObject({ method: 'POST', body, redirect: 'error', credentials: 'omit', headers: { authorization: 'Bearer private-access', 'Idempotency-Key': 'unique_attempt_00001' } })
    expect(JSON.stringify(f.auth.identity)).not.toContain('private-access')
    await expect(f.auth.fetchModel('/v1/chat/completions', body, signal)).rejects.toThrow('attempt id')
    const modelSignal = fetcher.mock.calls[3]?.[1]?.signal
    await f.auth.signOut()
    expect(modelSignal?.aborted).toBe(true)
    await expect(f.auth.fetchModel('/v1/models', undefined, signal)).rejects.toThrow('sign-in')
    expect(fetcher).toHaveBeenCalledTimes(4)
  })
  it('never substitutes a provider account when native configuration is missing', async () => {
    const f = fixture()
    const auth = new IndusAuth({
      config: undefined,
      store: f.store,
      fetch: f.fetcher,
      notify: f.changed,
      lost: f.lost,
      open: f.open,
    })
    expect(auth.state).toBe('unconfigured')
    await auth.start()
    await auth.restore()
    expect(f.fetcher).not.toHaveBeenCalled()
    expect(f.open).not.toHaveBeenCalled()
    auth.dispose()
  })
  it('requires a public registered client and a non-privileged callback port', () => {
    expect(() => indusAuthConfig({ DSH_CLIENT_INDUS_OAUTH_CLIENT_ID: 'secret' })).toThrow()
    expect(() =>
      indusAuthConfig({ DSH_CLIENT_INDUS_OAUTH_CLIENT_ID: clientId, DSH_CLIENT_INDUS_OAUTH_CALLBACK_PORT: '443' }),
    ).toThrow()
    expect(indusAuthConfig({ DSH_CLIENT_INDUS_OAUTH_CLIENT_ID: clientId })?.callbackPort).toBe(43189)
  })
  it('creates independent state and an S256 challenge from a 256-bit verifier', () => {
    const p = indusPkce()
    expect(p.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/u)
    expect(p.challenge).toBe(createHash('sha256').update(p.verifier).digest('base64url'))
    expect(p.state).not.toBe(indusPkce().state)
  })
  it('rejects duplicate, foreign, malformed, denied and mismatched callback input', () => {
    const state = indusPkce().state
    const good = `/indus-auth/callback?state=${state}&code=once`
    expect(indusAuthorizationCode(good, state)).toBe('once')
    for (const input of [
      good + '&code=twice',
      good + '&x=1',
      good.replace('/indus-auth/callback', '/other'),
      'http://evil.test' + good,
      good.replace(state, 'x'.repeat(43)),
      good.replace(state, 'é'.repeat(43)),
      good.replace('code=once', 'error=access_denied'),
      good + '#fragment',
    ])
      expect(indusAuthorizationCode(input, state)).toBeUndefined()
  })
  it('restores only after the issuer verifies identity and stores the rotated refresh credential', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(token))
      .mockResolvedValueOnce(Response.json({ sub: userId, email: 'member@example.test', email_verified: true }))
    const f = fixture(fetcher)
    f.store.read.mockResolvedValue('old-refresh')
    await f.auth.restore()
    expect(f.auth.identity).toEqual({ id: userId, email: 'member@example.test' })
    expect(f.auth.state).toBe('signed-in')
    expect(f.store.write).toHaveBeenCalledWith('rotated-refresh')
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://jpwvgpnbkrktipwhvqss.supabase.co/auth/v1/oauth/token')
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error', credentials: 'omit', cache: 'no-store' })
    await f.auth.signOut()
    expect(f.lost).toHaveBeenCalledOnce()
    expect(f.auth.identity).toBeUndefined()
    f.auth.dispose()
  })
  it('refuses unverified users and malformed tokens', async () => {
    for (const response of [
      { ...token, expires_in: NaN },
      { ...token, access_token: '' },
      { ...token, token_type: 'other' },
    ]) {
      const f = fixture(vi.fn<typeof fetch>().mockResolvedValue(Response.json(response)))
      f.store.read.mockResolvedValue('old')
      await f.auth.restore()
      expect(f.auth.state).toBe('signed-out')
      expect(f.store.write).not.toHaveBeenCalled()
      f.auth.dispose()
    }
    const f = fixture(
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json(token))
        .mockResolvedValueOnce(Response.json({ sub: userId, email: 'member@example.test', email_verified: false })),
    )
    f.store.read.mockResolvedValue('old')
    await f.auth.restore()
    expect(f.auth.identity).toBeUndefined()
    f.auth.dispose()
  })
  it('cannot resurrect a session when a token response arrives after sign-out', async () => {
    let resolve!: (value: Response) => void
    const delayed = new Promise<Response>((r) => {
      resolve = r
    })
    const fetcher = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(delayed)
      .mockResolvedValueOnce(Response.json({ sub: userId, email: 'member@example.test', email_verified: true }))
    const f = fixture(fetcher)
    f.store.read.mockResolvedValue('old')
    const restoring = f.auth.restore()
    await Promise.resolve()
    await f.auth.signOut()
    resolve(Response.json(token))
    await restoring
    expect(f.auth.identity).toBeUndefined()
    expect(f.store.write).not.toHaveBeenCalled()
    f.auth.dispose()
  })
})

it('keeps a cancelled restore from clearing a newer identity', async () => {
  let reject!: (error: Error) => void
  const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(
    () =>
      new Promise<Response>((_resolve, rejectRequest) => {
        reject = rejectRequest
      }),
  )
  const f = fixture(fetcher)
  f.store.read.mockResolvedValue('old-refresh')
  const restoring = f.auth.restore()
  await Promise.resolve()
  await f.auth.cancel()
  reject(new Error('late response'))
  await restoring
  expect(f.store.clear).not.toHaveBeenCalled()
  expect(f.auth.state).toBe('signed-out')
  f.auth.dispose()
})

it('exchanges a single state-bound loopback callback with the original PKCE verifier', async () => {
  const f = fixture(
    vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(token))
      .mockResolvedValueOnce(Response.json({ sub: userId, email: 'member@example.test', email_verified: true })),
    0,
  )
  await f.auth.start()
  expect(f.auth.state).toBe('waiting')
  const authorization = new URL(f.open.mock.calls[0]![0])
  expect(authorization.origin).toBe('https://jpwvgpnbkrktipwhvqss.supabase.co')
  expect(authorization.searchParams.get('client_id')).toBe(clientId)
  expect(authorization.searchParams.get('scope')).toBe('openid email profile')
  expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
  const callback = new URL(authorization.searchParams.get('redirect_uri')!)
  callback.searchParams.set('state', 'x'.repeat(43))
  callback.searchParams.set('code', 'single-code')
  expect((await fetch(callback)).status).toBe(400)
  expect(f.fetcher).not.toHaveBeenCalled()
  callback.searchParams.set('state', authorization.searchParams.get('state')!)
  const accepted = await fetch(callback)
  expect(accepted.status).toBe(200)
  expect(accepted.headers.get('cache-control')).toBe('no-store')
  await expect.poll(() => f.auth.state).toBe('signed-in')
  const body = f.fetcher.mock.calls[0]![1]!.body
  if (!(body instanceof URLSearchParams)) throw new Error('Authorization form missing')
  const parameters = body
  expect(parameters.get('code')).toBe('single-code')
  expect(parameters.has('client_secret')).toBe(false)
  expect(createHash('sha256').update(parameters.get('code_verifier')!).digest('base64url')).toBe(
    authorization.searchParams.get('code_challenge'),
  )
  await fetch(callback).catch(() => undefined)
  expect(f.fetcher).toHaveBeenCalledTimes(2)
})

it('ends a denied authorization without an exchange or a lingering callback listener', async () => {
  const f = fixture(vi.fn<typeof fetch>(), 0)
  await f.auth.start()
  const authorization = new URL(f.open.mock.calls[0]![0])
  const callback = new URL(authorization.searchParams.get('redirect_uri')!)
  callback.searchParams.set('state', authorization.searchParams.get('state')!)
  callback.searchParams.set('error', 'access_denied')
  expect((await fetch(callback)).status).toBe(200)
  expect(f.auth.state).toBe('signed-out')
  expect(f.fetcher).not.toHaveBeenCalled()
  await expect(fetch(callback)).rejects.toThrow()
})

it('ignores a code exchange that finishes after the user cancels', async () => {
  let resolve!: (response: Response) => void
  const f = fixture(
    vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((r) => {
          resolve = r
        }),
    ),
    0,
  )
  await f.auth.start()
  const authorization = new URL(f.open.mock.calls[0]![0])
  const callback = new URL(authorization.searchParams.get('redirect_uri')!)
  callback.searchParams.set('state', authorization.searchParams.get('state')!)
  callback.searchParams.set('code', 'cancelled-code')
  await fetch(callback)
  const cancelled = f.auth.cancel()
  resolve(Response.json(token))
  await cancelled
  expect(f.auth.state).toBe('signed-out')
  expect(f.fetcher).toHaveBeenCalledOnce()
  expect(f.store.write).not.toHaveBeenCalled()
})

it('stops signed-in work even if removing the encrypted credential fails', async () => {
  const f = fixture(
    vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(token))
      .mockResolvedValueOnce(Response.json({ sub: userId, email: 'member@example.test', email_verified: true })),
  )
  f.store.read.mockResolvedValue('old')
  await f.auth.restore()
  f.store.clear.mockRejectedValue(new Error('Disk unavailable'))
  await expect(f.auth.signOut()).rejects.toThrow('Disk unavailable')
  expect(f.lost).toHaveBeenCalledOnce()
  expect(f.auth.identity).toBeUndefined()
  expect(f.auth.state).toBe('failed')
})
