import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { prepareDevelopmentApp } from '../scripts/development-app.ts'

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }))
afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

it('regenerates cached development registration when the product profile changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'io-harness-development-product-'))
  onTestFinished(() => {
    rmSync(root, { recursive: true, force: true })
  })
  const source = join(root, 'Electron.app')
  mkdirSync(join(source, 'Contents', 'MacOS'), { recursive: true })
  mkdirSync(join(source, 'Contents', 'Resources'), { recursive: true })
  writeFileSync(join(source, 'Contents', 'Info.plist'), '<plist/>')
  vi.mocked(execFileSync).mockImplementation((command, args) => {
    if (command === '/usr/bin/ditto') {
      if (typeof args?.[0] !== 'string' || typeof args[1] !== 'string') throw new Error('missing copy paths')
      cpSync(args[0], args[1], { recursive: true })
    }
    return Buffer.from('')
  })
  const options = {
    electron: join(source, 'Contents', 'MacOS', 'Electron'),
    appRoot: root,
    directory: root,
    home: join(root, 'home'),
    userData: join(root, 'user-data'),
    mainPort: 9229,
    rendererPort: 9222,
    hostPort: 9230,
    openDevtools: '0',
  }
  vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'official')
  prepareDevelopmentApp(options)
  vi.mocked(execFileSync).mockClear()
  prepareDevelopmentApp(options)
  expect(vi.mocked(execFileSync).mock.calls.some(([command]) => command === '/usr/bin/plutil')).toBe(false)
  vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'indus-orbit')
  prepareDevelopmentApp(options)
  const registrations = vi.mocked(execFileSync).mock.calls.filter(([command]) => command === '/usr/bin/plutil')
  expect(registrations.some(([, args]) => args?.includes('"I/O Harness Dev"'))).toBe(true)
  expect(registrations.some(([, args]) => args?.some(value => value.includes('io-ws')))).toBe(true)
  expect(
    readFileSync(join(root, 'Harness Dev.app', 'Contents', 'Resources', 'dsh-development.json'), 'utf8'),
  ).toContain('indusorbit.workstation.preview')
})
