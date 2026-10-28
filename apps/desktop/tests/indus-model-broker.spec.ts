/** Real loopback requests exercise private admission, byte preservation and cancellation. */
import { randomBytes } from 'node:crypto'
import { get } from 'node:http'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { IndusModelBroker } from '../src/indus-model-broker.ts'

type Forward = ConstructorParameters<typeof IndusModelBroker>[0]

const policy = { requestBytes: 1024, responseBytes: 2048, concurrentRequests: 2, requestTimeoutMs: 10_000 }
async function fixture(forward = vi.fn<Forward>(async () => new Response('{"object":"list","data":[]}', { headers: { 'content-type': 'application/json' } }))) {
  const broker = new IndusModelBroker(forward, policy)
  onTestFinished(async () => { await broker.close() })
  const connection = await broker.start()
  const headers = { authorization: `Bearer ${connection.capability}`, 'content-type': 'application/json' }
  return { broker, forward, connection, headers }
}

describe('Indus Orbit private model broker', () => {
  it('bounds concurrent operations and releases admission after they finish', async () => {
    const entered = Promise.withResolvers<undefined>()
    const release = Promise.withResolvers<undefined>()
    let calls = 0
    const forward = vi.fn<Forward>(async () => {
      calls++
      if (calls === 2) entered.resolve(undefined)
      await release.promise
      return Response.json({ object: 'list', data: [] })
    })
    const f = await fixture(forward)
    const requests = [0, 1].map(() => fetch(`${f.connection.baseURL}/models`, { headers: f.headers }))
    try {
      await entered.promise
      const refused = await fetch(`${f.connection.baseURL}/models`, { headers: f.headers })
      expect(refused.status).toBe(429)
      await refused.text()
      expect(calls).toBe(2)
    } finally {
      release.resolve(undefined)
      for (const result of await Promise.allSettled(requests))
        if (result.status === 'fulfilled') await result.value.text()
    }
    const next = await fetch(`${f.connection.baseURL}/models`, { headers: f.headers })
    expect(next.status).toBe(200)
    await next.text()
    expect(calls).toBe(3)
  })
  it('allocates one private loopback socket and preserves the exact request prefix', async () => {
    const f = await fixture()
    expect(await f.broker.start()).toBe(f.connection)
    expect(f.connection.baseURL).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1$/u)
    expect(f.connection.capability).toMatch(/^[A-Za-z0-9_-]{43}$/u)
    const body = '{ "model": "io/harness-primary", "messages": [{"role":"user", "content":"नमस्ते"}] }'
    const response = await fetch(`${f.connection.baseURL}/chat/completions`, { method: 'POST', headers: f.headers, body })
    expect(response.status).toBe(200)
    await response.text()
    expect(f.forward).toHaveBeenCalledTimes(1)
    expect(f.forward.mock.calls[0]?.slice(0, 2)).toEqual(['/v1/chat/completions', body])
    expect(f.forward.mock.calls[0]?.[3]).toMatch(/^[A-Za-z0-9_-]{32}$/u)
  })

  it('denies missing/foreign capabilities, browser origins, alternate hosts and unlisted operations before forwarding', async () => {
    const f = await fixture()
    const attempts = [
      { url: '/models', headers: {} },
      { url: '/models', headers: { ...f.headers, authorization: `Bearer ${randomBytes(32).toString('base64url')}` } },
      { url: '/models', headers: { ...f.headers, origin: 'https://indusorbit.com' } },
      { url: '/models', headers: { ...f.headers, 'sec-fetch-site': 'cross-site' } },
      { url: '/models', headers: { ...f.headers, host: 'attacker.invalid' } },
      { url: '/models?url=https://attacker.invalid', headers: f.headers },
      { url: '/responses', headers: f.headers },
    ]
    for (const attempt of attempts) {
      const status = await new Promise<number | undefined>((resolve, reject) => {
        const request = get(f.connection.baseURL + attempt.url, { headers: attempt.headers }, (response) => {
          response.resume()
          response.once('end', () => { resolve(response.statusCode) })
        })
        request.once('error', reject)
      })
      expect([400, 403]).toContain(status)
    }
    expect(f.forward).not.toHaveBeenCalled()
  })

  it('preserves streamed tool frames and cache usage without forwarding cookies or arbitrary headers', async () => {
    const frames = 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{}"}}]}}]}\n\ndata: {"usage":{"prompt_tokens":100,"prompt_tokens_details":{"cached_tokens":80}}}\n\ndata: [DONE]\n\n'
    const forward = vi.fn<Forward>(async () => new Response(frames, { headers: { 'content-type': 'text/event-stream', 'x-io-request-id': 'safe-id', 'set-cookie': 'private=never-forward', authorization: 'never-forward' } }))
    const f = await fixture(forward)
    const r = await fetch(`${f.connection.baseURL}/chat/completions`, { method: 'POST', headers: f.headers, body: '{}' })
    expect(await r.text()).toBe(frames)
    expect(r.headers.get('x-io-request-id')).toBe('safe-id')
    expect(r.headers.get('set-cookie')).toBeNull()
    expect(r.headers.get('authorization')).toBeNull()
  })

  it('gives separate attempts distinct ids and never retries a failed paid attempt', async () => {
    const forward = vi.fn<Forward>(async () => { throw new Error('private transport diagnostic') })
    const f = await fixture(forward)
    for (let i = 0; i < 2; i++) {
      const r = await fetch(`${f.connection.baseURL}/chat/completions`, { method: 'POST', headers: f.headers, body: '{}' })
      expect(r.status).toBe(502)
      expect(await r.text()).not.toContain('private transport diagnostic')
    }
    expect(forward).toHaveBeenCalledTimes(2)
    expect(forward.mock.calls[0]?.[3]).not.toBe(forward.mock.calls[1]?.[3])
  })

  it('bounds request bytes before forwarding and refuses non-JSON upstream content', async () => {
    const f = await fixture()
    const large = await fetch(`${f.connection.baseURL}/chat/completions`, { method: 'POST', headers: f.headers, body: 'x'.repeat(1025) })
    expect(large.status).toBe(413)
    await large.text()
    expect(f.forward).not.toHaveBeenCalled()
    f.forward.mockResolvedValueOnce(new Response('<html>wrong service</html>', { headers: { 'content-type': 'text/html' } }))
    const r = await fetch(`${f.connection.baseURL}/models`, { headers: f.headers })
    expect(r.status).toBe(502)
    expect(await r.text()).not.toContain('wrong service')
    f.forward.mockResolvedValueOnce(new Response('x'.repeat(2049), { headers: { 'content-type': 'application/json' } }))
    const oversized = fetch(`${f.connection.baseURL}/models`, { headers: f.headers }).then(response => response.text())
    await expect(oversized).rejects.toThrow()
  })

  it('aborts active forwarding and waits for quiescence on close', async () => {
    let started!: () => void
    const entered = new Promise<void>((resolve) => { started = resolve })
    let aborted = false
    const forward = vi.fn<Forward>(async (_path: string, _body: string | undefined, signal: AbortSignal) => {
      started()
      await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { aborted = true; resolve() }, { once: true }) })
      throw new Error('cancelled')
    })
    const f = await fixture(forward)
    const request = fetch(`${f.connection.baseURL}/models`, { headers: f.headers }).catch(() => undefined)
    await entered
    await f.broker.close()
    await request
    expect(aborted).toBe(true)
    await expect(f.broker.start()).rejects.toThrow('closed')
    await f.broker.close()
  })
})
