import { afterEach, expect, it, vi } from 'vitest'
import { parseDesktopPackageInvocation, resolveRequestedBuildVersion } from '../scripts/package-target.ts'
import { suggestDesktopBuildVersion } from '../scripts/desktop-build-version-discovery.ts'

vi.mock('../scripts/desktop-build-version-discovery.ts', () => ({ suggestDesktopBuildVersion: vi.fn(async () => '0.2.1-rc.3.20261027.4') }))
afterEach(() => vi.clearAllMocks())

it('retains fork selectors while excluding preset release settings from automatic numbering', async () => {
  const invocation = parseDesktopPackageInvocation(['mac-arm64', '--unsigned', '--build-version', 'auto'], 'darwin', 'arm64')
  const environment = { DSH_BUILD_CLIENT_PROFILE: 'indus-orbit', DSH_CLIENT_BUILD_PROFILE: 'indus-orbit',
    DSH_PACKAGING_PRESET: 'test', DOWNLOAD_TEST_ORIGIN: 'https://unused.invalid', DOWNLOAD_TEST_COS_SECRET_KEY: 'fixture-secret' }
  expect(await resolveRequestedBuildVersion(invocation, '0.2.1-rc.3', environment)).toBe('0.2.1-rc.3.20261027.4')
  expect(vi.mocked(suggestDesktopBuildVersion).mock.calls[0]?.[0]).toMatchObject({
    target: 'mac-arm64', environment: { DSH_BUILD_CLIENT_PROFILE: 'indus-orbit', DSH_CLIENT_BUILD_PROFILE: 'indus-orbit' },
  })
  expect(vi.mocked(suggestDesktopBuildVersion).mock.calls[0]?.[0].environment).not.toHaveProperty('DOWNLOAD_TEST_COS_SECRET_KEY')
  expect(vi.mocked(suggestDesktopBuildVersion).mock.calls[0]?.[0].environment).not.toHaveProperty('DOWNLOAD_TEST_ORIGIN')
})
