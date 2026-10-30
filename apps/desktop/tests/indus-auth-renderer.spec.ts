/** Sign-in remains readable while native state loads or its IPC request fails. */
import { readFileSync } from 'node:fs'
import { runInContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import { expect, it, onTestFinished, vi } from 'vitest'
import { indusAuthCopy } from '../src/indus-auth-copy.ts'
import type { IndusAuthState } from '../src/indus-auth.ts'

function page(language: string, read: () => Promise<{ state: IndusAuthState }>) {
  const dom = new JSDOM(readFileSync(new URL('../renderer/indus-auth.html', import.meta.url), 'utf8'), { runScripts: 'outside-only' })
  onTestFinished(() => {
    dom.window.dispatchEvent(new dom.window.Event('pagehide'))
    dom.window.close()
  })
  const copy = indusAuthCopy(language)
  let publish!: (state: IndusAuthState) => void
  const dispose = vi.fn()
  const api = { copy, read, start: vi.fn(async () => 'waiting' as const), cancel: vi.fn(async () => 'signed-out' as const),
    onState: (listener: (state: IndusAuthState) => void) => { publish = listener; return dispose } }
  Object.defineProperty(dom.window, 'indusIdentity', { value: api })
  runInContext(readFileSync(new URL('../renderer/indus-auth.js', import.meta.url), 'utf8'), dom.getInternalVMContext())
  const start = dom.window.document.getElementById('start') as HTMLButtonElement
  const cancel = dom.window.document.getElementById('cancel') as HTMLButtonElement
  const status = dom.window.document.getElementById('status')!
  return { dom, copy, api, start, cancel, status, dispose, publish: (state: IndusAuthState) => { publish(state) } }
}

it.each(['en', 'zh-CN'])('shows localized identity and a labelled disabled button before IPC settles: %s', async (language) => {
  const pending = Promise.withResolvers<{ state: IndusAuthState }>()
  const p = page(language, () => pending.promise)
  expect(p.dom.window.document.title).toBe(p.copy.title)
  expect(p.dom.window.document.querySelector('h1')?.textContent).toBe('[H]')
  expect(p.dom.window.document.querySelector('img')?.getAttribute('src')).toBe('assets/io-harness-mark.svg')
  expect(p.start.textContent).toBe(p.copy.start)
  expect(p.start.disabled).toBe(true)
  expect(p.status.textContent).toBe(p.copy.loading)
  pending.resolve({ state: 'signed-out' })
  await expect.poll(() => p.start.disabled).toBe(false)
  p.start.click()
  await expect.poll(() => p.status.textContent).toBe(p.copy.waiting)
  expect(p.cancel.hidden).toBe(false)
  p.cancel.click()
  await expect.poll(() => p.status.textContent).toBe(p.copy['signed-out'])
  p.publish('signed-in')
  expect(p.start.disabled).toBe(true)
  p.dom.window.dispatchEvent(new p.dom.window.Event('pagehide'))
  expect(p.dispose).toHaveBeenCalledOnce()
})

it.each(['en', 'zh-CN'])('reports failed native state loading and permits no sign-in action: %s', async (language) => {
  const p = page(language, async () => { throw new Error('private internal diagnostic') })
  await expect.poll(() => p.status.textContent).toBe(p.copy.unavailable)
  expect(p.start.textContent).toBe(p.copy.start)
  expect(p.start.disabled).toBe(true)
  expect(p.cancel.hidden).toBe(true)
  expect(p.dom.window.document.body.textContent).not.toContain('private internal diagnostic')
  expect(p.api.start).not.toHaveBeenCalled()
})

it('keeps an unconfigured build disabled without subscribing to credentials', async () => {
  const p = page('en', async () => ({ state: 'unconfigured' }))
  await expect.poll(() => p.status.textContent).toBe(p.copy.unconfigured)
  expect(p.start.disabled).toBe(true)
  expect(p.cancel.hidden).toBe(true)
  expect(p.api.start).not.toHaveBeenCalled()
})
