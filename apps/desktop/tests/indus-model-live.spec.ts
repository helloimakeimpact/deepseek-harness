/** Explicit owner-only Telnyx qualification; ordinary unit/CI runs make no paid requests. */
import { writeFile } from 'node:fs/promises'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import { expect, it } from 'vitest'
import { IndusModelBroker } from '../src/indus-model-broker.ts'
import { indusModelPlugin } from '../../desktop-host/src/indus-model.ts'

const enabled = process.env.IO_H_TELNYX_NATIVE_SMOKE === '1'
const model = 'deepseek-ai/DeepSeek-V4.1-Flash'

it.skipIf(!enabled)('qualifies bounded native turns against owner-authorized Telnyx credits', {
  retry: 0, timeout: 120_000,
}, async () => {
  const apiKey = process.env.IO_PROVIDER_TELNYX_API_KEY
  const report = process.env.IO_H_NATIVE_SMOKE_REPORT
  if (apiKey === undefined || apiKey.length === 0 || report === undefined)
    throw new Error('Native smoke requires explicit credentials and a report path')
  let attempts = 0
  const cases: { kind: string; finish: string; failureCode?: string; localConcurrency?: boolean; usage?: TokenUsage }[] = []
  const ctx = new Context()
  const broker = new IndusModelBroker(async (path, body, signal) => {
    if (path === '/v1/models') return Response.json({ object: 'list', data: [{
      id: 'io/harness-primary', name: 'I/O test route', context_window: 32_768,
      max_output_tokens: 4096, input_modalities: ['text'],
    }] })
    if (body === undefined || Buffer.byteLength(body) > 14_000 || attempts >= 2) throw new Error('Native smoke invocation budget exceeded')
    const request: unknown = JSON.parse(body)
    if (typeof request !== 'object' || request === null || !('max_tokens' in request)
      || (request.max_tokens !== 32 && request.max_tokens !== 256) || !('stream' in request) || request.stream !== true)
      throw new Error('Native smoke output budget is invalid')
    attempts++
    const response = await fetch('https://api.telnyx.com/v2/ai/openai/chat/completions', {
      method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ...request, model }), redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(45_000)]),
    })
    if (!response.ok) {
      await response.body?.cancel()
      return Response.json({ error: { message: `Telnyx returned HTTP ${String(response.status)}` } }, { status: response.status })
    }
    return response
  }, { requestBytes: 14_000, responseBytes: 256 * 1024, concurrentRequests: 4, requestTimeoutMs: 50_000 })
  try {
    const connection = await broker.start()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(indusModelPlugin(connection))
    for (const tool of process.env.IO_H_NATIVE_SMOKE_CASE === 'tool' ? [true] : [false, true]) {
      const assembler = new BlockAssembler()
      const prompt = tool ? 'Call the echo tool with text hello. Do not answer in prose.' : 'Reply only with the word hello.'
      for await (const chunk of ctx.llm.stream({
        provider: 'indus-orbit', model: 'io/harness-primary', maxTokens: tool ? 256 : 32,
        messages: [createUserMessage({
          source: { kind: 'model', provider: 'indus-orbit', model: 'io/harness-primary' },
          content: [{ type: 'text', text: prompt }],
        })],
        ...tool ? { tools: [{ name: 'echo', description: 'Return text.', parameters: {
          type: 'object', properties: { text: { type: 'string' } }, required: ['text'],
        } }] } : {},
      })) assembler.push(chunk)
      cases.push({
        kind: tool ? 'tool' : 'text', finish: assembler.finish.kind,
        ...assembler.finish.kind !== 'error' ? {} : {
          failureCode: assembler.finish.failure.code,
          localConcurrency: assembler.finish.failure.message.includes('concurrent'),
        },
        ...assembler.usage === undefined ? {} : { usage: assembler.usage },
      })
      expect(assembler.finish.kind).toBe(tool ? 'tool-calls' : 'stop')
      const message = assembler.message({ provider: 'indus-orbit', model: 'io/harness-primary' })
      expect(message.content.some(block => tool
        ? block.type === 'tool-call' && block.name === 'echo'
        : block.type === 'text' && block.text.length > 0)).toBe(true)
    }
  } finally {
    try { await ctx.fiber.dispose() }
    finally {
      await broker.close()
      await writeFile(report, JSON.stringify({
        date: new Date().toISOString().slice(0, 10), provider: 'telnyx', model, attempts, cases,
        estimatedInvocationCeilingUsd: 0.01, invoiceCostVerified: false,
        scope: 'Native pi-ai adapter and private loopback broker to direct Telnyx. '
          + 'Synthetic gateway metadata; no hosted I/O grant, workspace charge or route activation.',
        retainsCredentialsPromptsOrGeneratedText: false,
      }, null, 2) + '\n')
    }
  }
})
