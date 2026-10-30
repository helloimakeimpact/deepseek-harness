/** Prevent the Indus Orbit preview from inheriting upstream release credentials or update services. */
import { desktopProduct } from '../src/product.ts'

/**
 * Resolve the packaging identity and reject conflicting build selectors.
 * @param {NodeJS.ProcessEnv} environment - Build or packaging environment.
 * @returns {ReturnType<typeof desktopProduct>} Selected native identity.
 */
export function desktopPackagingProduct(environment) {
  const selected = environment.DSH_BUILD_CLIENT_PROFILE
  const embedded = environment.DSH_CLIENT_BUILD_PROFILE
  if (selected !== undefined && embedded !== undefined && selected !== embedded) {
    throw new Error('desktop profile: selected profile differs from the built client profile; rebuild with the selected profile')
  }
  const profile = selected ?? embedded
  if (profile !== undefined && profile !== 'official' && profile !== 'indus-orbit') {
    throw new Error('desktop profile: expected official or indus-orbit')
  }
  return desktopProduct(profile)
}

/**
 * Reject signed fork packaging until a fork-owned release configuration is reviewed.
 * @param {NodeJS.ProcessEnv} environment - Packaging environment.
 * @param {boolean} unsigned - Whether the invocation is an unsigned local preview.
 * @returns {void}
 */
export function assertDesktopProfilePackaging(environment, unsigned) {
  if (desktopPackagingProduct(environment).profile === 'indus-orbit' && !unsigned) {
    throw new Error('desktop profile: I/O Harness supports unsigned local previews only; fork signing, accounts and update publication require review')
  }
}

/**
 * Reject upstream feed and upload resolution for the fork, including explicit upstream settings.
 * @param {NodeJS.ProcessEnv} environment - Update or upload environment.
 * @returns {void}
 */
export function assertDesktopProfileUpdates(environment) {
  if (!desktopPackagingProduct(environment).updatesEnabled) {
    throw new Error('desktop profile: I/O Harness has no approved update or upload destination')
  }
}
