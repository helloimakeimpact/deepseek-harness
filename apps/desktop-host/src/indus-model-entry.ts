/** Loader entry for the desktop-owned I/O model connection. */
import type { Context } from '@deepseek-ai/cordis'
import { indusModelPlugin } from './indus-model.ts'
import { requestIndusModelConnection } from './indus-model-ipc.ts'

export const name = 'desktop-indus-model'
export const inject = ['llm']

/**
 * Register the private provider through the shipped Indus profile.
 * @param ctx - Owning Loader lifetime with the LLM service injected.
 * @returns Completion after the private connection and provider registration are ready.
 */
export async function apply(ctx: Context): Promise<void> {
  const lifetime = new AbortController()
  ctx.effect(() => () => { lifetime.abort() })
  const connection = await requestIndusModelConnection(lifetime.signal)
  lifetime.signal.throwIfAborted()
  await ctx.plugin(indusModelPlugin(connection))
}
