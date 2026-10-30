/** Private, unfunded I/O connection used only by keyless packaging rehearsals. */
import { IndusModelBroker } from '../src/indus-model-broker.ts'

/**
 * Supply the fork Host handshake without provider credentials or funding approval.
 * Every model operation is denied; any inference attempt makes qualification fail.
 * @param profile Build profile inherited by the rehearsed Host.
 * @returns A lazy broker and post-teardown assertion, or undefined for upstream Hosts.
 */
export function createDesktopSmokeModelBroker(profile: string | undefined) {
  if (profile !== 'indus-orbit') return undefined
  let inferenceRequests = 0
  const broker = new IndusModelBroker(async (path) => {
    if (path === '/v1/chat/completions') inferenceRequests++
    return Response.json({ error: { message: 'Packaging rehearsal has no I/O funding approval.' } }, { status: 401 })
  }, { requestBytes: 65_536, responseBytes: 65_536, concurrentRequests: 4, requestTimeoutMs: 15_000 })
  return {
    broker,
    assertNoInference(): void {
      if (inferenceRequests !== 0) throw new Error('desktop runtime: keyless rehearsal attempted model inference')
    },
  }
}
