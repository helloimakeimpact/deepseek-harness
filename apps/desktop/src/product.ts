/** Build-selected native identity; the fork preview has no update or signing destination. */

/**
 * Select native names and protocol from the public profile embedded at build time.
 * @param profile - Embedded client profile; unselected local builds retain the upstream identity.
 * @returns Native filesystem-safe names, visible brand, stable identity profile, protocol and separate update eligibility.
 */
export function desktopProduct(profile: string | undefined = process.env.DSH_CLIENT_BUILD_PROFILE) {
  return profile === 'indus-orbit'
    ? {
      profile: 'indus-orbit', displayName: 'I/O Harness', nativeName: 'IO Harness', artifactPrefix: 'io-harness',
      protocol: 'io-ws', previewAppId: 'local.indusorbit.workstation.preview', updatesEnabled: false,
      homeDirectoryName: 'Indus Orbit Workstation Data', userDataDirectoryName: 'IO W-S',
    } as const
    : {
      profile: 'official', displayName: 'DeepSeek Harness', nativeName: 'DeepSeek Harness', artifactPrefix: 'deepseek-harness',
      protocol: 'dsh', previewAppId: 'com.deepseek.harness', updatesEnabled: true,
    } as const
}
