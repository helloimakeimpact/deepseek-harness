/** The Worker wrapper consumes CommonJS package faces before lowered ESM fallbacks. */
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lowerModuleSource } from '../../src/compile/transform.ts'
import { WorkerModuleLoader } from '../../src/module-system/module-loader.ts'
import { MemoryVfs } from '../../src/storage/memory.ts'

const ROOT = '/dsh/node_modules/conditional'

/** Seed distinct, executable package faces; selecting an excluded face must not evaluate it. */
function fixture(exports: unknown, conditions?: readonly string[]): WorkerModuleLoader {
  const vfs = new MemoryVfs()
  vfs.seed(`${ROOT}/package.json`, JSON.stringify({ name: 'conditional', exports }))
  for (const face of ['browser', 'require', 'import', 'default']) {
    vfs.seed(`${ROOT}/${face}.cjs`, `module.exports = ${JSON.stringify(face)}`)
  }
  return new WorkerModuleLoader({ vfs, staticModules: {}, ...(conditions === undefined ? {} : { conditions }) })
}

describe('Worker package condition priority', () => {
  it.each([
    { import: './import.cjs', require: './require.cjs' },
    { default: './default.cjs', import: './import.cjs', require: './require.cjs' },
    { import: './import.cjs', require: { types: './absent.d.ts', default: './require.cjs' } },
  ])('uses the CommonJS face independently of manifest key order: %j', (exports) => {
    const require = fixture(exports).createRequire('/dsh/')
    expect(require('conditional')).toBe('require')
  })

  it('prefers the browser face to Node-only and generic CommonJS faces', () => {
    const require = fixture({ node: './absent.cjs', require: './require.cjs', browser: './browser.cjs' }).createRequire('/dsh/')
    expect(require('conditional')).toBe('browser')
  })

  it('keeps an import-only package available before its default fallback', () => {
    const require = fixture({ default: './default.cjs', import: './import.cjs' }).createRequire('/dsh/')
    expect(require('conditional')).toBe('import')
  })

  it('uses the caller condition order when supplied', () => {
    const require = fixture({ browser: './browser.cjs', default: './default.cjs' }, ['default', 'browser']).createRequire('/dsh/')
    expect(require('conditional')).toBe('default')
  })

  it('loads the installed Zod through its cycle-safe CommonJS face', () => {
    const sourceRoot = dirname(createRequire(import.meta.url).resolve('zod/package.json'))
    const vfs = new MemoryVfs()
    const prefix = '/dsh/node_modules/zod'
    vfs.seed(`${prefix}/package.json`, readFileSync(join(sourceRoot, 'package.json'), 'utf8'))
    for (const path of readdirSync(sourceRoot, { recursive: true, encoding: 'utf8' })) {
      if (!/\.[cm]?js$/u.test(path)) continue
      const source = readFileSync(join(sourceRoot, path), 'utf8')
      const filename = `${prefix}/${path.replaceAll('\\', '/')}`
      vfs.seed(filename, lowerModuleSource({ filename, source }).code)
    }
    // Zod owns this cross-module configuration; preserve the test process's exact prior state.
    const previous = Object.getOwnPropertyDescriptor(globalThis, '__zod_globalConfig')
    try {
      Object.defineProperty(globalThis, '__zod_globalConfig', { value: {}, writable: true, configurable: true })
      const loader = new WorkerModuleLoader({ vfs, staticModules: {} })
      const require = loader.createRequire('/dsh/')
      const zod = require('zod') as typeof import('zod')
      expect(require.resolve('zod')).toBe(`${prefix}/index.cjs`)
      const schema = zod.object({ title: zod.string().min(1), count: zod.number().int() })
      expect(schema.parse({ title: 'Worker', count: 2 })).toEqual({ title: 'Worker', count: 2 })
      expect(schema.safeParse({ title: '', count: 1.5 }).success).toBe(false)
      expect(require('zod')).toBe(zod)
    } finally {
      if (previous === undefined) Reflect.deleteProperty(globalThis, '__zod_globalConfig')
      else Object.defineProperty(globalThis, '__zod_globalConfig', previous)
    }
  })
})
