import { afterEach, describe, expect, it, vi } from 'vitest'
import { desktopProduct } from '../src/product.ts'
import { resolveDesktopLocale } from '../src/locale.ts'
import { assertDesktopProfilePackaging, desktopPackagingProduct } from '../scripts/desktop-product-profile.mjs'
import { resolveDesktopAutoUpdateConfig, resolveDesktopUploadConfig } from '../scripts/desktop-auto-update-environment.mjs'

afterEach(() => vi.unstubAllEnvs())

describe('I/O Harness native preview identity', () => {
  const fork = { DSH_BUILD_CLIENT_PROFILE: 'indus-orbit' }

  it('separates native names, installer files and protocol from the upstream application', () => {
    expect(desktopPackagingProduct(fork)).toEqual({ profile: 'indus-orbit', displayName: 'I/O Harness', nativeName: 'IO Harness',
      artifactPrefix: 'io-harness', protocol: 'io-ws', previewAppId: 'local.indusorbit.workstation.preview', updatesEnabled: false,
      homeDirectoryName: 'Indus Orbit Workstation Data', userDataDirectoryName: 'IO W-S' })
    expect(desktopProduct('official')).toMatchObject({ displayName: 'DeepSeek Harness', protocol: 'dsh', updatesEnabled: true })
    expect(() => desktopPackagingProduct({ ...fork, DSH_CLIENT_BUILD_PROFILE: 'official' })).toThrow(/differs/)
    expect(() => desktopPackagingProduct({ DSH_BUILD_CLIENT_PROFILE: 'typo' })).toThrow(/expected official or indus-orbit/)
  })

  it('keeps durable Harness data outside every fork installer data-deletion target', () => {
    const product = desktopProduct('indus-orbit')
    if (product.profile !== 'indus-orbit') throw new Error('expected fork preview')
    expect(product.homeDirectoryName).not.toBe(product.nativeName)
    expect(product.userDataDirectoryName).toBe('IO W-S')
    expect(product.homeDirectoryName).not.toBe(product.userDataDirectoryName)
    expect(product.homeDirectoryName).not.toBe('io-ws-preview')
    expect(product.homeDirectoryName).not.toBe('io-ws-preview-updater')
    expect(product.homeDirectoryName).toBe('Indus Orbit Workstation Data')
  })

  it('rejects signed packages and upstream feeds even when upstream production settings are supplied', () => {
    expect(() =>{  assertDesktopProfilePackaging(fork, true) }).not.toThrow()
    expect(() =>{  assertDesktopProfilePackaging(fork, false) }).toThrow(/unsigned local previews only/)
    for (const environment of ['test', 'production']) {
      const inherited = { ...fork, DSH_DESKTOP_AUTO_UPDATE_ENV: environment,
        DOWNLOAD_TEST_ORIGIN: 'https://unused.invalid', DOWNLOAD_TEST_RELEASE_ID: 'a'.repeat(32) }
      expect(() => resolveDesktopAutoUpdateConfig(inherited, 'darwin', 'arm64')).toThrow(/no approved update or upload/)
      expect(() => resolveDesktopUploadConfig(inherited, 'win32', 'x64')).toThrow(/no approved update or upload/)
    }
    expect(resolveDesktopAutoUpdateConfig({ DSH_BUILD_CLIENT_PROFILE: 'official', DSH_DESKTOP_AUTO_UPDATE_ENV: 'production' }, 'darwin', 'arm64').origin)
      .toBe('https://download.deepseek.com')
  })

  it('keeps both native locale dictionaries on the Harness and Foundation identity', () => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'indus-orbit')
    for (const locale of ['en-US', 'zh-CN']) {
      const messages = resolveDesktopLocale(locale).messages
      expect(messages.aboutProduct).toBe('I/O Harness')
      expect(messages.welcomeWorkstation).toBe('Harness')
      expect(messages.welcomeFoundation).toBe('Indus Orbit · The General Intelligence Foundation of India')
      expect(messages.welcomeSignIn).toContain('Indus Orbit')
      expect(messages.welcomeDescription).toBe('Intelligence, built together.')
    }
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'official')
    expect(resolveDesktopLocale('en-US').messages.aboutProduct).toBe('DeepSeek Harness')
  })
})
