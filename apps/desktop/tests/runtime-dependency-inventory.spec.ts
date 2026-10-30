import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { assertReviewedRuntimeDependency, DESKTOP_DEPENDENCY_INVENTORY_FILE, DESKTOP_DEPENDENCY_LOCK_FILE, inventoryDesktopDependencies, writeDesktopDependencyInventory } from '../scripts/runtime-dependency-inventory.ts'
import { verifyDesktopRuntime, writeDesktopRuntime } from '../src/runtime-tree.ts'
import { runtimeFixture } from './runtime-fixture.ts'

const roots: string[] = []
const links: string[] = []
afterEach(() => {
  for (const link of links.splice(0)) unlinkSync(link)
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'desktop-dependency-inventory-'))
  roots.push(root)
  mkdirSync(join(root, 'node_modules'))
  return root
}

function installed(root: string, location: string, name: string, version: string): string {
  const path = join(root, location, 'package.json')
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify({ name, version, type: 'module' }))
  return path
}

it.each([
  ['zod', '4.4.3'], ['zod', '4.6.6-beta.1'], ['undici', '8.11.2'],
  ['@modelcontextprotocol/client', '2.2.0'], ['@hono/node-server', '1.19.17'],
  ['fflate', 'invalid'],
])('refuses a reviewed affected installed dependency: %s@%s', (name, version) => {
  expect(() => { assertReviewedRuntimeDependency(name, version) }).toThrow('requires reviewed')
})

it('records scoped, aliased and deep bundled node_modules copies with actual manifest identities', () => {
  const root = fixture()
  installed(root, 'node_modules/zod-alias', 'zod', '4.6.6')
  installed(root, 'node_modules/@modelcontextprotocol/client', '@modelcontextprotocol/client', '2.3.0')
  installed(root, 'node_modules/outer', 'outer', '1.0.0')
  installed(root, 'node_modules/outer/node_modules/undici', 'undici', '8.12.2')
  installed(root, 'node_modules/outer/vendor/node_modules/qs', 'qs', '6.16.1')
  installed(root, 'node_modules/outer/tests/fixture', 'zod', '4.4.3')
  const entries = inventoryDesktopDependencies(root)
  expect(entries.map(({ name, version, path }) => ({ name, version, path }))).toEqual([
    { name: '@modelcontextprotocol/client', version: '2.3.0', path: 'node_modules/@modelcontextprotocol/client' },
    { name: 'outer', version: '1.0.0', path: 'node_modules/outer' },
    { name: 'undici', version: '8.12.2', path: 'node_modules/outer/node_modules/undici' },
    { name: 'qs', version: '6.16.1', path: 'node_modules/outer/vendor/node_modules/qs' },
    { name: 'zod', version: '4.6.6', path: 'node_modules/zod-alias' },
  ])
  for (const entry of entries) expect(entry.manifestSha256).toBe(createHash('sha256').update(readFileSync(join(root, entry.path, 'package.json'))).digest('hex'))
})

it.each(['nested', 'alias'])('rejects a stale physical copy hidden behind %s resolution', (kind) => {
  const root = fixture()
  installed(root, 'node_modules/outer', 'outer', '1.0.0')
  installed(root, 'node_modules/zod', 'zod', '4.6.6')
  installed(root, kind === 'alias' ? 'node_modules/safe-looking-name' : 'node_modules/outer/vendor/node_modules/zod', 'zod', '4.4.3')
  expect(() => writeDesktopDependencyInventory(root, { completedAt: '2026-10-29T09:00:00.000Z', lock: Buffer.from('lockfileVersion: 9.0\n') }, { platform: 'darwin', arch: 'arm64' })).toThrow('zod@4.4.3')
  expect(existsSync(join(root, DESKTOP_DEPENDENCY_INVENTORY_FILE))).toBe(false)
})

it.each(['virtual store', 'missing manifest', 'invalid manifest', 'empty modules'])('refuses an unqualified package tree: %s', (kind) => {
  const root = fixture()
  if (kind === 'virtual store') mkdirSync(join(root, 'node_modules/.pnpm'))
  if (kind === 'missing manifest') mkdirSync(join(root, 'node_modules/missing'))
  if (kind === 'invalid manifest') installed(root, 'node_modules/invalid', 'invalid', 'next')
  expect(() => inventoryDesktopDependencies(root)).toThrow()
})

it('rejects package-directory links without reading their destination', () => {
  const root = fixture()
  const outside = join(root, 'outside')
  mkdirSync(outside)
  const link = join(root, 'node_modules/linked')
  symlinkSync(outside, link, 'junction')
  links.push(link)
  expect(() => inventoryDesktopDependencies(root)).toThrow('links are not materialized')
  expect(existsSync(join(outside, 'package.json'))).toBe(false)
})

it('seals the audited-lock reference and final manifest hashes with the runtime bytes', async () => {
  const root = fixture()
  const runtime = runtimeFixture(root)
  installed(root, 'node_modules/zod', 'zod', '4.6.6')
  const audit = { completedAt: '2026-10-29T09:00:00.000Z', lock: Buffer.from('lockfileVersion: 9.0\n') }
  const target = { platform: 'darwin' as const, arch: 'arm64' }
  const inventory = writeDesktopDependencyInventory(root, audit, target)
  expect(inventory).toMatchObject({ schemaVersion: 1, platform: 'darwin', arch: 'arm64', registryAudit: { completedAt: audit.completedAt, lockSha256: createHash('sha256').update(audit.lock).digest('hex'), lockFile: DESKTOP_DEPENDENCY_LOCK_FILE, command: 'pnpm audit --prod --audit-level=info' } })
  expect(JSON.parse(readFileSync(join(root, DESKTOP_DEPENDENCY_INVENTORY_FILE), 'utf8'))).toEqual(inventory)
  const descriptor = writeDesktopRuntime(root, runtime.release, runtime.sharedPackages.map(entry => entry.name), target)
  expect(readFileSync(join(root, DESKTOP_DEPENDENCY_LOCK_FILE)).equals(audit.lock)).toBe(true)
  expect(descriptor.files.some(file => file.path === DESKTOP_DEPENDENCY_LOCK_FILE)).toBe(true)
  expect(descriptor.files.some(file => file.path === DESKTOP_DEPENDENCY_INVENTORY_FILE)).toBe(true)
  expect(await verifyDesktopRuntime(root, runtime.release.version, target)).toEqual(descriptor)
  writeFileSync(join(root, DESKTOP_DEPENDENCY_INVENTORY_FILE), '{}\n')
  await expect(verifyDesktopRuntime(root, runtime.release.version, target)).rejects.toThrow()
})
