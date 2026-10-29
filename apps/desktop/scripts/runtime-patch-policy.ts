/** Desktop-specific selection of workspace and runtime-only dependency patches. */

/** A patch shared with the workspace, excluded from runtime installation, or supplied only to Desktop. */
export type DesktopRuntimePatch =
  | { scope: 'shared'; reason: string }
  | { scope: 'workspace-only'; reason: string }
  | { scope: 'runtime-only'; path: string; reason: string }

/** Every workspace patch requires an explicit Desktop decision; runtime-only entries may add or replace a patch. */
export const DESKTOP_RUNTIME_PATCHES: Readonly<Record<string, DesktopRuntimePatch>> = {
  '@earendil-works/pi-ai@1.1.0': { scope: 'shared', reason: 'Runtime providers need the streamed argument parsing fix.' },
  '@electron/osx-sign@1.3.3': { scope: 'workspace-only', reason: 'Signing executes on the build host.' },
  '@fortune-sheet/core@1.0.4': { scope: 'workspace-only', reason: 'Patched spreadsheet code is embedded in the client bundle.' },
  '@fortune-sheet/react@1.0.4': { scope: 'workspace-only', reason: 'Patched spreadsheet code is embedded in the client bundle.' },
  '@yao-pkg/pkg@6.21.0': { scope: 'workspace-only', reason: 'The executable packer executes on the build host.' },
  'app-builder-lib@26.17.0': { scope: 'workspace-only', reason: 'DMG format validation executes on the build host.' },
  'exceljs@4.4.0': { scope: 'workspace-only', reason: 'The patched parser is embedded in the client bundle and worker.' },
  'node-pty@1.2.0-beta.15': { scope: 'shared', reason: 'Runtime terminals need helper resolution and Windows worker cleanup.' },
}

/** Reviewed security versions applied to the independently resolved Desktop runtime. */
export const DESKTOP_RUNTIME_SECURITY_OVERRIDES: Readonly<Record<string, string>> = {
  'fflate@>=0.8.0 <0.8.3': '0.8.3',
  'hono@>=4.12.4 <4.13.11': '4.13.11',
  '@modelcontextprotocol/sdk@>=1 <1.32.0': '1.32.0',
  '@modelcontextprotocol/client@>=2 <2.3.0': '2.3.0',
  'ip-address@>=10 <10.7.4': '10.7.4',
  'zod@>=4 <4.6.6': '4.6.6',
  'body-parser@>=2 <2.4.0': '2.4.0',
  'undici@>=8 <8.12.2': '8.12.2',
  'fast-uri@>=3 <3.1.9': '3.1.9',
  '@hono/node-server@>=1.19.10 <2.1.3': '2.1.3',
  'qs@>=6.7 <6.16.1': '6.16.1',
}

/** Reviewed Desktop dependency constraints, independent of patch selection. */
export const DESKTOP_RUNTIME_DEPENDENCY_OVERRIDES: Readonly<Record<string, string>> = {
  // The provider declares ^1.1.0; its patch is qualified against 1.1.0.
  '@earendil-works/pi-ai@^1.1.0': '1.1.0',
  ...DESKTOP_RUNTIME_SECURITY_OVERRIDES,
}
