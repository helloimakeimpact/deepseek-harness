/** Select complete public identity values for direct Desktop builds and root-build children. */
import { repositoryClientBuildEnvironment, resolveClientBuildEnvironment, type ClientBuildEnvironment } from '../../../scripts/client-build-environment.ts'

/**
 * Preserve the named profile selector while supplying repository version metadata.
 * @param root - Repository root supplying missing version and commit metadata.
 * @param environment - Inherited build environment, including the non-public profile selector.
 * @returns Exact public values selected for the Desktop artifacts.
 */
export function desktopClientBuildEnvironment(root: string, environment: NodeJS.ProcessEnv): ClientBuildEnvironment {
  const inherited = environment.DSH_CLIENT_VERSION === undefined ? repositoryClientBuildEnvironment(root, environment) : environment
  return resolveClientBuildEnvironment(inherited, environment.DSH_BUILD_CLIENT_PROFILE)
}
