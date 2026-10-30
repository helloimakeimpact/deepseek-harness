/** I/O provider registered in the native Host without provider or OAuth credentials. */
import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, LlmResolvedModelInfo, PreparedAdapterCall, StreamChunk } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter, resolveProfiles } from '@deepseek-ai/dsh-llm-pi-ai'

/** Private main-to-Host socket capability, valid only for this desktop lifetime. */
export interface IndusHostConnection {
  readonly baseURL: string
  readonly capability: string
}

/**
 * Parse a private IPC connection; remote URLs and persistent credentials are refused.
 * @param value - Untrusted main-to-Host IPC payload.
 * @returns A detached, validated loopback connection.
 */
export function parseIndusHostConnection(value: unknown): IndusHostConnection {
  if (typeof value !== 'object' || value === null || !('baseURL' in value) || !('capability' in value)
    || typeof value.baseURL !== 'string' || typeof value.capability !== 'string'
    || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/v1$/u.test(value.baseURL)
    || !/^[A-Za-z0-9_-]{43}$/u.test(value.capability) || Object.keys(value).length !== 2)
    throw new Error('Invalid private I/O model connection')
  const parsed = new URL(value.baseURL)
  if (Number(parsed.port) > 65535) throw new Error('Invalid private I/O model port')
  return Object.freeze({ baseURL: value.baseURL, capability: value.capability })
}

type ModelDescriptor = { id: string; name: string; contextWindow: number; maxTokens: number; input: ['text']; reasoningEfforts: false }

function parseCatalog(value: unknown): ModelDescriptor[] {
  if (typeof value !== 'object' || value === null || !('object' in value) || value.object !== 'list'
    || !('data' in value) || !Array.isArray(value.data) || value.data.length > 100)
    throw new LlmError('I/O model catalogue is invalid. Reconnect I/O credits before continuing.', 'INVALID_CONFIG')
  const seen = new Set<string>()
  return value.data.map((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || !('id' in entry) || typeof entry.id !== 'string'
      || entry.id.length === 0 || entry.id.length > 200 || /[\x00-\x20\x7f]/u.test(entry.id) || seen.has(entry.id)
      || !('name' in entry) || typeof entry.name !== 'string' || entry.name.length === 0 || entry.name.length > 200
      || !('context_window' in entry) || typeof entry.context_window !== 'number' || !Number.isSafeInteger(entry.context_window)
      || !('max_output_tokens' in entry) || typeof entry.max_output_tokens !== 'number' || !Number.isSafeInteger(entry.max_output_tokens)
      || entry.max_output_tokens <= 0 || entry.max_output_tokens > 4096 || entry.context_window <= entry.max_output_tokens
      || !('input_modalities' in entry) || !Array.isArray(entry.input_modalities)
      || entry.input_modalities.length !== 1 || entry.input_modalities[0] !== 'text')
      throw new LlmError('I/O model capabilities are not qualified for this build.', 'INVALID_CONFIG')
    seen.add(entry.id)
    return { id: entry.id, name: entry.name, contextWindow: entry.context_window, maxTokens: entry.max_output_tokens, input: ['text'], reasoningEfforts: false }
  })
}

/** Resolves fresh reviewed model capacities before binding a maintained OpenAI adapter. */
export class IndusModelAdapter extends LlmAdapter {
  constructor(
    private readonly connection: IndusHostConnection,
    private readonly lifetime: AbortSignal,
    private readonly read: typeof fetch = fetch,
  ) { super() }

  override providerInfo(provider: string) { return { id: provider, name: 'Indus Orbit · I/O' } }
  override providerRetryPolicy() { return resolveRetryPolicy({ mode: 'normal', maxRetries: 0 }, 'indus-orbit') }

  #requestSignal(signal?: AbortSignal): AbortSignal {
    return AbortSignal.any([this.lifetime, ...signal === undefined ? [] : [signal]])
  }

  async #adapter(signal?: AbortSignal): Promise<PiAiAdapter> {
    const combined = AbortSignal.any([this.lifetime, AbortSignal.timeout(15_000), ...signal === undefined ? [] : [signal]])
    const response = await this.read(`${this.connection.baseURL}/models`, {
      headers: { authorization: `Bearer ${this.connection.capability}` },
      redirect: 'error', credentials: 'omit', cache: 'no-store', signal: combined,
    })
    if (!response.ok || response.body === null) {
      await response.body?.cancel()
      throw new LlmError(
        response.status === 401 || response.status === 403
          ? 'Connect I/O credits from the I/O Harness application menu, or sign in again. No model request was sent.'
          : 'I/O model access is unavailable. Check your workspace and connection before retrying.',
        response.status === 401 || response.status === 403 ? 'MISSING_CREDENTIAL' : 'SERVER',
      )
    }
    if (response.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') {
      await response.body.cancel()
      throw new LlmError('I/O model catalogue is invalid.', 'INVALID_CONFIG')
    }
    const reader = response.body.getReader()
    let bytes = 0
    const chunks: Uint8Array[] = []
    try {
      while (true) {
        const part = await reader.read()
        if (part.done) break
        bytes += part.value.byteLength
        if (bytes > 64 * 1024) throw new LlmError('I/O model catalogue exceeds limit.', 'INVALID_CONFIG')
        chunks.push(part.value)
      }
    } finally {
      await reader.cancel().catch((_closedCatalogue: unknown) => undefined)
      reader.releaseLock()
    }
    let raw: unknown
    try { raw = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
    catch (_invalidJson: unknown) { throw new LlmError('I/O model catalogue is invalid.', 'INVALID_CONFIG') }
    combined.throwIfAborted()
    const models = parseCatalog(raw)
    const profiles = resolveProfiles({
      'indus-orbit': {
        displayName: 'Indus Orbit · I/O', api: 'openai-completions', baseURL: this.connection.baseURL,
        apiKeyEnv: 'IO_H_PRIVATE_BROKER', models, retryPolicy: { mode: 'normal', maxRetries: 0 },
        compat: { supportsDeveloperRole: false, supportsStore: false, supportsUsageInStreaming: true, supportsReasoningEffort: false, maxTokensField: 'max_tokens' },
      },
    })
    return new PiAiAdapter({
      profiles: () => profiles,
      resolveApiKey: () => Promise.resolve(this.connection.capability),
      auth: {
        credentials: {
          read: () => Promise.resolve(undefined), list: () => Promise.resolve([]),
          modify: () => Promise.reject(new Error('I/O uses the private desktop connection')),
          delete: () => Promise.resolve(),
        },
        authContext: { env: () => Promise.resolve(undefined), fileExists: () => Promise.resolve(false) },
      },
    })
  }

  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    try { return await (await this.#adapter()).listModels(provider) }
    catch (error) {
      if (error instanceof LlmError && error.code === 'MISSING_CREDENTIAL') return []
      throw error
    }
  }
  override async resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    return (await this.#adapter(signal)).resolveModel(provider, model, signal)
  }
  override async prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall> {
    const adapter = await this.#adapter(signal)
    const prepared = await adapter.prepareCall(provider, model, signal)
    return {
      model: prepared.model,
      stream: options => prepared.stream({ ...options, signal: this.#requestSignal(options.signal) }),
    }
  }
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const adapter = await this.#adapter(options.signal)
    yield* adapter.stream({ ...options, signal: this.#requestSignal(options.signal) })
  }
}

/**
 * Create a registered provider whose private connection never becomes plugin configuration.
 * @param connection - Validated socket capability supplied by the desktop main process.
 * @returns A lifetime-owned Cordis provider plugin.
 */
export function indusModelPlugin(connection: IndusHostConnection) {
  return {
    name: 'llm-indus-orbit', inject: ['llm'],
    apply(ctx: Context): void {
      ctx.effect(() => {
        const lifetime = new AbortController()
        const unregister = ctx.llm.registerAdapter(['indus-orbit'], new IndusModelAdapter(connection, lifetime.signal))
        return () => { lifetime.abort(); unregister() }
      })
    },
  }
}
