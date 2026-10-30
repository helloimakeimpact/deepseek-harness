import { describe, expect, it } from 'vitest'
import { clientBuildProcessEnvironment, resolveClientBuildEnvironment } from './client-build-environment.ts'

describe('Indus Orbit named client build', () => {
  const metadata = { DSH_CLIENT_COMMIT_HASH: 'abc1234', DSH_CLIENT_VERSION: '0.2.1-rc.3' }

  it('owns its title and profile and discards inherited branding and public extensions', () => {
    const parent = { ...metadata, DSH_BUILD_CLIENT_PROFILE: 'indus-orbit',
      DSH_CLIENT_BUILD_PROFILE: 'official', DSH_CLIENT_TITLE: 'I/O Terminal', DSH_CLIENT_EXTRA: 'stale', DSH_CLIENT_INDUS_OAUTH_CLIENT_ID: 'untrusted-client', PATH: '/bin' }
    const selected = resolveClientBuildEnvironment(parent)
    expect(selected).toEqual({ ...metadata, DSH_CLIENT_BUILD_PROFILE: 'indus-orbit', DSH_CLIENT_TITLE: 'I/O Harness — Indus Orbit',
      DSH_CLIENT_INDUS_OAUTH_CLIENT_ID: 'cf26c996-8c19-42c6-82ff-f0b6ccafd3ee', DSH_CLIENT_INDUS_OAUTH_CALLBACK_PORT: '43189' })
    expect(clientBuildProcessEnvironment(parent, selected)).toEqual({ PATH: '/bin', ...selected })
    expect(resolveClientBuildEnvironment(parent, 'official').DSH_CLIENT_TITLE).toBe('DeepSeek Harness')
  })

  it('requires version and commit metadata and rejects unknown named profiles', () => {
    expect(() => resolveClientBuildEnvironment({}, 'indus-orbit')).toThrow(/DSH_CLIENT_COMMIT_HASH/)
    expect(() => resolveClientBuildEnvironment({ DSH_CLIENT_COMMIT_HASH: 'abc1234' }, 'indus-orbit')).toThrow(/DSH_CLIENT_VERSION/)
    expect(() => resolveClientBuildEnvironment(metadata, 'indus')).toThrow(/unknown client build profile/)
  })
})
