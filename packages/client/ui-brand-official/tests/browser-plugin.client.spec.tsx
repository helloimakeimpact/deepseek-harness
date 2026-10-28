// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { apply, inject } from '../src/client/index.ts'
import { OfficialBrandMark, OfficialBrandName } from '../src/client/Brand.tsx'
import { IndusBrandMark, IndusBrandName } from '../src/client/IndusBrand.tsx'
import { apply as hostApply } from '../src/index.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

const HOLES = [
  'sidebar.brand.mark',
  'sidebar.brand.name',
] as const

const HERO_HOLE = 'conversation.hero.brand.mark'

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  const declareHoles = () => slots.register({
    name: 'root',
    children: Object.fromEntries([...HOLES, HERO_HOLE].map(name => [name, { kind: 'single', scope: 'root' }])),
  } as never, () => null)
  const disposeHoles = declare ? declareHoles() : undefined
  return { ctx, slots, declareHoles, disposeHoles }
}

describe('official browser-brand plugin', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('declares only the slot service it uses', () => {
    expect(inject).toEqual(['slots'])
  })

  it('leaves every slot empty outside the official build profile', async () => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'local')
    const subject = await bench()
    await subject.ctx.plugin({ inject: [...inject], apply }).await()
    for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(0)
  })

  it('fills declarations before or after apply and removes every occupant on teardown', async () => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'official')
    const before = await bench()
    const fiber = before.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(1)

    before.disposeHoles?.()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(0)
    before.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(1)

    await fiber.dispose()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(0)

    const after = await bench(false)
    await after.ctx.plugin({ inject: [...inject], apply }).await()
    for (const hole of HOLES) expect(after.slots.entries(hole)).toHaveLength(0)
    after.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES) expect(after.slots.entries(hole)).toHaveLength(1)
  })

  it('leaves the conversation hero on its declaring fallback even in official builds', async () => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'official')
    const subject = await bench()
    await subject.ctx.plugin({ inject: [...inject], apply }).await()
    expect(subject.slots.entries(HERO_HOLE)).toHaveLength(0)
  })

  it('mounts the Indus sidebar and hero together and restores them after declarations return', async () => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'indus-orbit')
    const subject = await bench(false)
    const fiber = subject.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const holes = [...HOLES, HERO_HOLE] as const
    for (const hole of holes) expect(subject.slots.entries(hole)).toHaveLength(0)
    const dispose = subject.declareHoles()
    await Promise.resolve()
    for (const hole of holes) expect(subject.slots.entries(hole)).toHaveLength(1)
    dispose()
    for (const hole of holes) expect(subject.slots.entries(hole)).toHaveLength(0)
    subject.declareHoles()
    await Promise.resolve()
    for (const hole of holes) expect(subject.slots.entries(hole)).toHaveLength(1)
    await fiber.dispose()
    for (const hole of holes) expect(subject.slots.entries(hole)).toHaveLength(0)
  })

  it('renders the Indus product name and approved pixel artwork at both host sizes', () => {
    const name = render(<IndusBrandName />)
    expect(name.getByLabelText('I/O Harness')).toBeTruthy()
    expect(name.getByText('H').tagName).toBe('STRONG')
    expect(name.getByText('Harness')).toBeTruthy()
    expect(name.getByText('Indus Orbit')).toBeTruthy()
    expect(name.container.querySelector('[title]')?.getAttribute('title')).toBe('The General Intelligence Foundation of India')
    name.unmount()
    const mark = render(<IndusBrandMark size={34} className="host-placement" />)
    const image = mark.container.querySelector('img')
    expect(image?.getAttribute('src')).toContain('indus-orbit-mark.png')
    expect(image?.getAttribute('width')).toBe('34')
    expect(image?.getAttribute('alt')).toBe('')
    expect(image?.classList.contains('host-placement')).toBe(true)
    mark.rerender(<IndusBrandMark size={24} />)
    expect(image?.getAttribute('width')).toBe('24')
  })

  it('renders the official name independently from both requested mark sizes', () => {
    const name = render(<OfficialBrandName />)
    expect(name.container.querySelector('svg')?.getAttribute('viewBox')).toBe('26 0 156 24')
    name.unmount()

    const mark = render(<OfficialBrandMark size={34} />)
    expect(mark.container.querySelector('svg')?.getAttribute('width')).toBe('34')
    mark.rerender(<OfficialBrandMark size={24} />)
    expect(mark.container.querySelector('svg')?.getAttribute('width')).toBe('24')
  })
})
