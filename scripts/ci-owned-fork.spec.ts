/** Evaluate the owned fork's real runner selectors without removing required checks. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import yaml from 'js-yaml'
import { expect, it } from 'vitest'
import { parseCoveragePartitionCount } from './coverage-partitions.ts'

interface Job { 'runs-on'?: string; env?: Record<string, string>; needs?: string[]; steps?: { run?: string }[] }
const ci = yaml.load(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')) as { jobs: Record<string, Job>; permissions: Record<string, string> }
const owned = 'helloimakeimpact/deepseek-harness'
function evaluate(expression: string, repository: string, mode = ''): unknown {
  return runInNewContext(expression.trim().slice(3, -2), {
    vars: { DSH_CI_FAILOVER_LINUX: mode, DSH_CI_FAILOVER_WINDOWS: mode }, fromJSON: JSON.parse,
    github: { repository, event: { pull_request: { user: { login: 'maintainer' } } } },
  }, { timeout: 1000 })
}

it.each([
  ['node-24', 'ubuntu-24.04', 'dsh-ubuntu-24-04-16core'],
  ['node-24-coverage', 'ubuntu-24.04', 'dsh-ubuntu-24-04-16core'],
  ['node-24-consumers', 'ubuntu-24.04', 'dsh-ubuntu-24-04-16core'],
  ['windows-build', 'windows-2025', 'dsh-windows-2025-16core'],
  ['windows-coverage', 'windows-2025', 'dsh-windows-2025-16core'],
  ['windows-native-tests', 'windows-2025', 'dsh-windows-2025-16core'],
])('makes %s runnable in the owned fork and preserves the upstream defaults', (name, hosted, upstream) => {
  const selector = ci.jobs[name]!['runs-on']!
  expect(evaluate(selector, owned)).toBe(hosted)
  expect(evaluate(selector, 'deepseek-ai/deepseek-harness')).toBe(upstream)
  expect(evaluate(selector, owned, 'blacksmith')).toMatch(/^blacksmith-/)
  expect(evaluate(selector, owned, 'selfhosted')).toEqual(expect.arrayContaining(['self-hosted']))
})

it('bounds hosted coverage workers/partitions while preserving complete coverage and the aggregate dependencies', () => {
  for (const name of ['node-24-coverage', 'windows-coverage']) {
    const env = ci.jobs[name]!.env!
    expect(evaluate(env.DSH_COVERAGE_MAX_WORKERS!, owned)).toBe('2')
    expect(parseCoveragePartitionCount(String(evaluate(env.DSH_COVERAGE_PARTITIONS!, owned)))).toBe(2)
    expect(evaluate(env.DSH_GATE_CONCURRENCY!, owned)).toBe('1')
    expect(evaluate(env.DSH_COVERAGE_MAX_WORKERS!, 'deepseek-ai/deepseek-harness', 'selfhosted')).toBe('6')
    expect(env.DSH_COVERAGE_TEST_TIMEOUT_MS).toBe('90000')
    expect(ci.jobs[name]!.steps).toContainEqual(expect.objectContaining({ run: 'pnpm run check:ci:coverage' }))
  }
  expect(ci.jobs['all-checks-passed']!.needs).toEqual(expect.arrayContaining(['node-24', 'node-24-coverage', 'node-24-consumers', 'windows-build', 'windows-native-tests']))
  expect(ci.permissions).toEqual({ contents: 'read' })
})
