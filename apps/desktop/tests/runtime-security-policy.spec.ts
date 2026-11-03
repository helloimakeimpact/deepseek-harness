import { readFileSync } from 'node:fs'
import yaml from 'js-yaml'
import { expect, it } from 'vitest'
import { DESKTOP_RUNTIME_DEPENDENCY_OVERRIDES, DESKTOP_RUNTIME_PATCHES, DESKTOP_RUNTIME_SECURITY_OVERRIDES } from '../scripts/runtime-patch-policy.ts'

it('keeps the desktop runtime aligned with workspace security floors and the provider patch', () => {
  const workspace = yaml.load(readFileSync(new URL('../../../pnpm-workspace.yaml', import.meta.url), 'utf8')) as { overrides: Record<string, string> }
  for (const [selector, version] of Object.entries(DESKTOP_RUNTIME_SECURITY_OVERRIDES)) {
    expect(workspace.overrides[selector], selector).toBe(version)
    expect(DESKTOP_RUNTIME_DEPENDENCY_OVERRIDES[selector], selector).toBe(version)
  }
  const provider = JSON.parse(readFileSync(new URL('../../../packages/llm/llm-pi-ai/package.json', import.meta.url), 'utf8')) as { dependencies: Record<string, string> }
  const dependency = '@earendil-works/pi-ai'
  const pinned = DESKTOP_RUNTIME_DEPENDENCY_OVERRIDES[`${dependency}@${provider.dependencies[dependency]}`]
  expect(pinned).toBeDefined()
  expect(DESKTOP_RUNTIME_PATCHES[`${dependency}@${pinned}`]?.scope).toBe('shared')
})
