/** Record materialized npm package versions and reject known affected runtime dependencies. */
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { satisfies, valid } from 'semver'
import { DESKTOP_RUNTIME_SECURITY_OVERRIDES } from './runtime-patch-policy.ts'

/** Metadata sealed by the existing runtime file inventory. */
export const DESKTOP_DEPENDENCY_INVENTORY_FILE = 'dependency-inventory.json'

/** Audited resolution bytes retained for reproduction without changing plugin lockfiles. */
export const DESKTOP_DEPENDENCY_LOCK_FILE = 'dependency-lock.yaml'

/** One physical installed package, including nested or aliased copies. */
export interface DesktopDependencyEntry {
  readonly name: string
  readonly version: string
  readonly path: string
  readonly manifestSha256: string
}

/**
 * Reject a dependency version within a reviewed affected range, including prereleases.
 * @param name Actual package name from the resolved lock or installed manifest.
 * @param version Resolved package version.
 */
export function assertReviewedRuntimeDependency(name: string, version: string): void {
  for (const [selector, patchedVersion] of Object.entries(DESKTOP_RUNTIME_SECURITY_OVERRIDES)) {
    const separator = selector.lastIndexOf('@')
    if (name !== selector.slice(0, separator)) continue
    if (valid(version) === null || satisfies(version, selector.slice(separator + 1), { includePrerelease: true })) {
      throw new Error(`desktop dependencies: ${name}@${version} requires reviewed ${name}@${patchedVersion} or a qualified successor`)
    }
  }
}

/**
 * Inventory the dereferenced production tree, including nested and aliased dependencies.
 * Package containers with links, missing/invalid manifests or affected versions reject the tree.
 * Package fixtures outside node_modules containers are not installed dependencies.
 * @param root Materialized Desktop dsh directory, not a pnpm workspace or virtual store.
 * @returns Physical package entries sorted by their portable runtime-relative paths.
 */
export function inventoryDesktopDependencies(root: string): DesktopDependencyEntry[] {
  const entries: DesktopDependencyEntry[] = []
  function directory(path: string): void {
    const stat = lstatSync(path)
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('desktop dependencies: expected a materialized package directory')
  }
  function packageDirectory(path: string): void {
    directory(path)
    const bytes = readFileSync(join(path, 'package.json'))
    const manifest: unknown = JSON.parse(bytes.toString('utf8'))
    if (typeof manifest !== 'object' || manifest === null || !('name' in manifest) || typeof manifest.name !== 'string'
      || manifest.name.length === 0 || !('version' in manifest) || typeof manifest.version !== 'string' || valid(manifest.version) === null) {
      throw new Error('desktop dependencies: installed package has an invalid name or version')
    }
    assertReviewedRuntimeDependency(manifest.name, manifest.version)
    entries.push({ name: manifest.name, version: manifest.version, path: relative(root, path).split(sep).join('/'),
      manifestSha256: createHash('sha256').update(bytes).digest('hex') })
    nestedModules(path)
  }
  function nestedModules(path: string): void {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const nested = join(path, entry.name)
      if (entry.name === 'node_modules') modules(nested)
      else if (entry.isDirectory()) nestedModules(nested)
    }
  }
  function modules(path: string): void {
    directory(path)
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.name === '.pnpm') throw new Error('desktop dependencies: expected a materialized runtime, not a pnpm virtual store')
      if (entry.name.startsWith('.')) continue
      const packagePath = join(path, entry.name)
      if (entry.isSymbolicLink()) throw new Error('desktop dependencies: package links are not materialized')
      if (!entry.isDirectory()) continue
      if (!entry.name.startsWith('@')) packageDirectory(packagePath)
      else {
        for (const scoped of readdirSync(packagePath, { withFileTypes: true })) {
          if (scoped.name.startsWith('.')) continue
          packageDirectory(join(packagePath, scoped.name))
        }
      }
    }
  }
  modules(join(root, 'node_modules'))
  if (entries.length === 0) throw new Error('desktop dependencies: no installed packages to qualify')
  return entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
}

/**
 * Write package metadata after registry audit and manifest preparation, before runtime sealing.
 * Registry audit covers the independently resolved npm graph; this is not a binary/Python audit.
 * @param root Materialized Desktop dsh directory.
 * @param audit Registry-audit completion time and its unchanged pnpm lock bytes.
 * @param target Target platform and architecture represented by the package tree.
 * @returns The inventory written beside the immutable runtime descriptor.
 */
export function writeDesktopDependencyInventory(
  root: string, audit: { completedAt: string; lock: Buffer },
  target: { platform: NodeJS.Platform; arch: string },
) {
  const inventory = {
    schemaVersion: 1,
    platform: target.platform, arch: target.arch,
    registryAudit: { command: 'pnpm audit --prod --audit-level=info', completedAt: audit.completedAt,
      lockFile: DESKTOP_DEPENDENCY_LOCK_FILE, lockSha256: createHash('sha256').update(audit.lock).digest('hex') },
    packages: inventoryDesktopDependencies(root),
  }
  writeFileSync(join(root, DESKTOP_DEPENDENCY_LOCK_FILE), audit.lock)
  writeFileSync(join(root, DESKTOP_DEPENDENCY_INVENTORY_FILE), `${JSON.stringify(inventory, null, 2)}\n`)
  return inventory
}
