import { afterEach, expect, it } from 'vitest'
import { createDesktopSmokeModelBroker } from '../scripts/smoke-model-broker.ts'

const fixtures: NonNullable<ReturnType<typeof createDesktopSmokeModelBroker>>[] = []
afterEach(async () => { await Promise.all(fixtures.splice(0).map(fixture => fixture.broker.close())) })

function modelFixture() {
  const fixture = createDesktopSmokeModelBroker('indus-orbit')!
  fixtures.push(fixture)
  return fixture
}

it('does not grant an I/O connection to upstream or unselected Hosts', () => {
  expect(createDesktopSmokeModelBroker('official')).toBeUndefined()
  expect(createDesktopSmokeModelBroker(undefined)).toBeUndefined()
})

it('answers authenticated catalogue requests as unfunded and closes its private listener', async () => {
  const fixture = modelFixture()
  const connection = await fixture.broker.start()
  try {
    const response = await fetch(connection.baseURL + '/models', { headers: { authorization: 'Bearer ' + connection.capability }, signal: AbortSignal.timeout(5000) })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: { message: 'Packaging rehearsal has no I/O funding approval.' } })
  } finally { await fixture.broker.close() }
  expect(() => { fixture.assertNoInference() }).not.toThrow()
  await expect(fetch(connection.baseURL + '/models', { signal: AbortSignal.timeout(5000) })).rejects.toThrow()
})

it('refuses and records an inference attempt even when the caller handles its denial', async () => {
  const fixture = modelFixture()
  try {
    const connection = await fixture.broker.start()
    const response = await fetch(connection.baseURL + '/chat/completions', {
      method: 'POST', headers: { authorization: 'Bearer ' + connection.capability, 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(5000),
    })
    expect(response.status).toBe(401)
    await response.body?.cancel()
  } finally { await fixture.broker.close() }
  expect(() => { fixture.assertNoInference() }).toThrow('attempted model inference')
})
