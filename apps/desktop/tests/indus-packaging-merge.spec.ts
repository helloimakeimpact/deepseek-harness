import { describe, expect, it } from 'vitest'
import { loadDesktopPackageEnvironment } from '../scripts/desktop-package-environment.mjs'
import { assertDesktopProfilePackaging, assertDesktopProfileUpdates, desktopPackagingProduct } from '../scripts/desktop-product-profile.mjs'

describe('upstream and I/O H packaging profiles', () => {
  const fork = { DSH_BUILD_CLIENT_PROFILE: 'indus-orbit', DSH_CLIENT_BUILD_PROFILE: 'indus-orbit' }

  it('accepts upstream local builds but rejects mismatched identities', () => {
    expect(desktopPackagingProduct({ DSH_BUILD_CLIENT_PROFILE: 'local', DSH_CLIENT_BUILD_PROFILE: 'local' }).profile).toBe('official')
    expect(() => desktopPackagingProduct({ ...fork, DSH_CLIENT_BUILD_PROFILE: 'local' })).toThrow(/differs/)
  })

  it('retains validated workflow compression while stripping inherited release settings', () => {
    const environment = { ...fork, DSH_DESKTOP_AUTO_UPDATE_ENV: 'production', DSH_DESKTOP_WINDOWS_TOKEN_PIN: 'synthetic', PACKAGE_WINDOWS_COMPRESSION_LEVEL: '7' }
    const selected = loadDesktopPackageEnvironment('win32', environment, '/unused', { unsigned: true })
    expect(selected).toMatchObject({ DSH_DESKTOP_APP_ID: 'local.indusorbit.workstation.preview', DSH_DESKTOP_UNSIGNED: '1', DSH_DESKTOP_WINDOWS_COMPRESSION_LEVEL: '7' })
    expect(selected.DSH_DESKTOP_AUTO_UPDATE_ENV).toBeUndefined()
    expect(selected.DSH_DESKTOP_WINDOWS_TOKEN_PIN).toBeUndefined()
    expect(() => loadDesktopPackageEnvironment('darwin', environment, '/unused', { unsigned: true })).toThrow(/requires Windows/)
    expect(() => loadDesktopPackageEnvironment('win32', { ...fork, PACKAGE_WINDOWS_COMPRESSION_LEVEL: '5' }, '/unused', { unsigned: true })).toThrow(/choice of 3 or 7/)
    expect(loadDesktopPackageEnvironment('darwin', { ...fork, PACKAGE_MACOS_ZIP_COMPRESSION_LEVEL: '3' }, '/unused', { unsigned: true }).DSH_DESKTOP_MACOS_ZIP_COMPRESSION_LEVEL).toBe('3')
    expect(() => loadDesktopPackageEnvironment('win32', { ...fork, PACKAGE_MACOS_ZIP_COMPRESSION_LEVEL: '3' }, '/unused', { unsigned: true })).toThrow(/requires macOS/)
  })

  it('continues to block signed builds and upstream update publication for I/O H', () => {
    expect(() => { assertDesktopProfilePackaging(fork, false) }).toThrow(/unsigned local previews only/)
    expect(() => { assertDesktopProfileUpdates(fork) }).toThrow(/no approved update or upload/)
  })
})
