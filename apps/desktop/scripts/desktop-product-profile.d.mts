import { desktopProduct } from '../src/product.ts'

/** Resolve the selected native packaging identity and reject conflicting selectors. */
export function desktopPackagingProduct(environment: NodeJS.ProcessEnv): ReturnType<typeof desktopProduct>

/** Reject signed fork packages until a fork-owned release configuration is reviewed. */
export function assertDesktopProfilePackaging(environment: NodeJS.ProcessEnv, unsigned: boolean): void

/** Reject all upstream update and upload destinations for the fork. */
export function assertDesktopProfileUpdates(environment: NodeJS.ProcessEnv): void
