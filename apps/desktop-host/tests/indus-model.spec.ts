/** Loader-driven I/O turns use the real adapter and main-process loopback broker. */
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader, { type ModuleLoaderV2 } from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LlmRuntime, { BlockAssembler, createUserMessage, createToolResultMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { IndusModelBroker } from '../../desktop/src/indus-model-broker.ts'
import { IndusAuth } from '../../desktop/src/indus-auth.ts'
import { IndusModelAdapter, indusModelPlugin, parseIndusHostConnection } from '../src/indus-model.ts'

const catalogue = { object: 'list', data: [{ id: 'io/harness-primary', name: 'I/O · Primary', context_window: 32_768, max_output_tokens: 4096, input_modalities: ['text'] }] }
const source = { kind: 'model', provider: 'indus-orbit', model: 'io/harness-primary' } as const
const ask = (): Message[] => [createUserMessage({ content: [{ type: 'text', text: 'Use echo to say hello.' }], source })]
const frames = (tool: boolean) => [
  { choices: [{ delta: { role: 'assistant', content: '' }, index: 0, finish_reason: null }] },
  tool ? { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_001', type: 'function', function: { name: 'echo', arguments: '{"text":"hello"}' } }] }, index: 0, finish_reason: null }] }
    : { choices: [{ delta: { content: 'hello' }, index: 0, finish_reason: null }] },
  { choices: [{ delta: {}, index: 0, finish_reason: tool ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 4, prompt_tokens_details: { cached_tokens: 80 } } },
].map(value => `data: ${JSON.stringify(value)}\n\n`).join('') + 'data: [DONE]\n\n'

async function fixture(clear = (): Promise<void> => Promise.resolve()) {
  const root = await mkdtemp(join(tmpdir(), 'indus-model-composition-'))
  onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
  let connected = true
  let tools = false
  let failPaid = false
  let stopHost = (): Promise<void> => Promise.resolve()
  const stopped = Promise.withResolvers<undefined>()
  const lost = vi.fn((): Promise<void> => Promise.resolve())
  const wire: { url: string; headers: Headers; body: Record<string, unknown> }[] = []
  const auth = new IndusAuth({
    config: { clientId: '11111111-1111-4111-8111-111111111111', callbackPort: 43189 },
    store: { read: () => Promise.resolve('synthetic-refresh'), write: () => Promise.resolve(), clear },
    open: () => Promise.resolve(), notify: () => {}, lost, stop: () => stopHost(),
    fetch: (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.endsWith('/oauth/token')) return Promise.resolve(Response.json({ access_token: 'synthetic-main-access', refresh_token: 'synthetic-refresh-next', token_type: 'bearer', expires_in: 3600 }))
      if (url.endsWith('/oauth/userinfo')) return Promise.resolve(Response.json({ sub: '22222222-2222-4222-8222-222222222222', email: 'member@example.test', email_verified: true }))
      if (!connected) return Promise.resolve(Response.json({ error: { message: 'I/O approval required' } }, { status: 403 }))
      if (url.endsWith('/v1/models')) return Promise.resolve(Response.json(catalogue))
      if (typeof init?.body !== 'string') throw new Error('Expected a serialized model request')
      wire.push({ url, headers: new Headers(init.headers), body: JSON.parse(init.body) as Record<string, unknown> })
      if (failPaid) return Promise.resolve(Response.json({ error: { message: 'Synthetic unknown provider outcome' } }, { status: 503 }))
      return Promise.resolve(new Response(frames(tools && wire.length === 1), { headers: { 'content-type': 'text/event-stream', 'x-io-request-id': `request_${String(wire.length)}` } }))
    },
  })
  onTestFinished(() => { auth.dispose() })
  await auth.restore()
  const broker = new IndusModelBroker((path, body, signal, id) => auth.fetchModel(path, body, signal, id), {
    requestBytes: 1024 * 1024, responseBytes: 64 * 1024, concurrentRequests: 4, requestTimeoutMs: 10_000,
  })
  onTestFinished(async () => { await broker.close() })
  const connection = await broker.start()
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  stopHost = async () => {
    await broker.close()
    await ctx.fiber.dispose()
    stopped.resolve(undefined)
  }
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([['llm', LlmRuntime], ['indus-connected', indusModelPlugin(connection)]])
  const internal: ModuleLoaderV2 = {
    version: 'v2', loadCache: new Map(),
    import: (specifier) => {
      if (!modules.has(specifier)) throw new Error(`Unexpected fixture plugin ${specifier}`)
      return Promise.resolve(modules.get(specifier))
    },
    register(): never { throw new Error('Unexpected hook registration') },
    getOrCreateModuleJob(): never { throw new Error('Unexpected module job') },
    resolveSync(): never { throw new Error('Unexpected synchronous resolution') },
    load(): never { throw new Error('Unexpected module load') },
  }
  ctx.loader.internal = internal
  const config = join(root, 'cordis.yml')
  await writeFile(config, '- name: llm\n- name: indus-connected\n')
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } })
  await ctx.loader.await()
  for (const entry of ctx.loader.entries()) await entry.fiber?.await()
  return {
    ctx, wire, auth, connection, config, lost, stopped: stopped.promise,
    setConnected: (value: boolean) => { connected = value },
    useTools: () => { tools = true }, failPaid: () => { failPaid = true },
  }
}

async function turn(ctx: Context, options: Partial<GenerateOptions> = {}) {
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream({ provider: 'indus-orbit', model: 'io/harness-primary', messages: ask(), maxTokens: 64, ...options })) assembler.push(chunk)
  return { message: assembler.message(source), finish: assembler.finish, usage: assembler.usage }
}

describe('Indus model Loader composition', () => {
  it('closes the actual broker and Loader while encrypted credential removal is held', async () => {
    const clearing = Promise.withResolvers<undefined>()
    const clearStarted = Promise.withResolvers<undefined>()
    onTestFinished(() => { clearing.resolve(undefined) })
    const f = await fixture(async () => { clearStarted.resolve(undefined); await clearing.promise })
    expect(await f.ctx.llm.listModels('indus-orbit')).toHaveLength(1)
    const signingOut = f.auth.signOut()
    onTestFinished(async () => { clearing.resolve(undefined); await signingOut })
    await clearStarted.promise
    await f.stopped
    expect(f.auth.state).toBe('signed-out')
    expect(f.lost).not.toHaveBeenCalled()
    await expect(fetch(`${f.connection.baseURL}/models`, {
      headers: { authorization: `Bearer ${f.connection.capability}` },
    })).rejects.toThrow()
    expect(f.wire).toHaveLength(0)
    clearing.resolve(undefined)
    await signingOut
    expect(f.lost).toHaveBeenCalledOnce()
  })

  it('does not replay a failed paid attempt through SDK or provider retries', async () => {
    const f = await fixture()
    f.failPaid()
    const result = await turn(f.ctx)
    expect(result.finish.kind).toBe('error')
    expect(f.wire).toHaveLength(1)
    const adapter = new IndusModelAdapter(f.connection, new AbortController().signal)
    expect(adapter.providerRetryPolicy()).toMatchObject({ mode: 'normal', maxRetries: 0 })
  })

  it('cannot use an already-prepared call after the provider lifetime ends', async () => {
    const f = await fixture()
    const lifetime = new AbortController()
    const adapter = new IndusModelAdapter(f.connection, lifetime.signal)
    const prepared = await adapter.prepareCall('indus-orbit', 'io/harness-primary')
    lifetime.abort()
    const assembler = new BlockAssembler()
    for await (const chunk of prepared.stream({ provider: 'indus-orbit', model: 'io/harness-primary', messages: ask(), maxTokens: 64 })) assembler.push(chunk)
    expect(assembler.finish.kind).toBe('aborted')
    expect(f.wire).toHaveLength(0)
  })
  it('discovers reviewed capabilities and streams through the owned gateway with main-only credentials', async () => {
    const f = await fixture()
    expect(f.ctx.llm.listProviders().map(value => value.id)).toContain('indus-orbit')
    expect(await f.ctx.llm.listModels('indus-orbit')).toMatchObject([{ id: 'io/harness-primary', name: 'I/O · Primary' }])
    expect(await f.ctx.llm.resolveModelInfo('indus-orbit', 'io/harness-primary')).toMatchObject({ context: { contextWindow: 32_768 }, defaultMaxTokens: 4096 })
    const result = await turn(f.ctx)
    expect(result.finish.kind).toBe('stop')
    expect(result.message.content).toEqual([{ type: 'text', text: 'hello' }])
    expect(result.usage?.cacheReadTokens).toBe(80)
    expect(f.wire).toHaveLength(1)
    expect(f.wire[0]?.url).toBe('https://jpwvgpnbkrktipwhvqss.supabase.co/functions/v1/io-harness/v1/chat/completions')
    expect(f.wire[0]?.headers.get('authorization')).toBe('Bearer synthetic-main-access')
    expect(f.connection.capability).not.toContain('synthetic-main-access')
    expect(await readFile(f.config, 'utf8')).not.toContain(f.connection.capability)
    expect(JSON.stringify(f.ctx.llm.listProviders())).not.toContain('synthetic-main-access')
  })

  it('preserves tools and the earlier conversation when appending a tool result', async () => {
    const f = await fixture()
    f.useTools()
    const tools = [{ name: 'echo', description: 'Return text.', parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }]
    const first = await turn(f.ctx, { tools })
    expect(first.finish.kind).toBe('tool-calls')
    const call = first.message.content.find(value => value.type === 'tool-call')!
    expect(call.name).toBe('echo')
    const second = await turn(f.ctx, { tools, messages: [...ask(), first.message, createToolResultMessage({ callId: ToolCallId(call.id), content: [{ type: 'text', text: 'hello' }], isError: false })] })
    expect(second.finish.kind).toBe('stop')
    const firstBody = f.wire[0]!.body
    const secondBody = f.wire[1]!.body
    expect(secondBody.tools).toEqual(firstBody.tools)
    if (!Array.isArray(secondBody.messages) || !Array.isArray(firstBody.messages)) throw new Error('Missing wire messages')
    expect(secondBody.messages.slice(0, firstBody.messages.length)).toEqual(firstBody.messages)
    await expect(JSON.stringify({ first: firstBody, followup: secondBody }, null, 2) + '\n')
      .toMatchFileSnapshot('./expected/indus-model-wire.json')
    expect(f.wire[0]?.headers.get('Idempotency-Key')).not.toBe(f.wire[1]?.headers.get('Idempotency-Key'))
  })

  it('refuses a revoked funding connection and does not send a paid request or fall back', async () => {
    const f = await fixture()
    const prepared = await f.ctx.llm.prepareCall({ provider: 'indus-orbit', model: 'io/harness-primary', maxTokens: 64 })
    f.setConnected(false)
    expect(await f.ctx.llm.listModels('indus-orbit')).toEqual([])
    const result = await turn(f.ctx)
    expect(result.finish.kind).toBe('error')
    expect(f.wire).toHaveLength(0)
    await f.auth.signOut()
    expect(f.ctx.get('llm')).toBeUndefined()
    const next = new BlockAssembler()
    for await (const chunk of prepared.stream({ ...prepared.config, messages: ask() })) next.push(chunk)
    expect(next.finish.kind).toBe('aborted')
    expect(f.wire).toHaveLength(0)
  })
})

it('rejects remote, malformed, credential-bearing and oversized private IPC endpoints', () => {
  const valid = { baseURL: 'http://127.0.0.1:12345/v1', capability: 'a'.repeat(43) }
  expect(parseIndusHostConnection(valid)).toEqual(valid)
  for (const value of [null, { ...valid, baseURL: 'https://attacker.invalid/v1' }, { ...valid, baseURL: 'http://127.0.0.1:99999/v1' }, { ...valid, capability: 'token' }, { ...valid, refreshToken: 'never-accepted' }])
    expect(() => parseIndusHostConnection(value)).toThrow()
})
