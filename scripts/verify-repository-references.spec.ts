import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it, type TestContext } from 'vitest'
import { findRepositoryReferences, scanRepositoryReferences, uniquePrefixMatch } from './verify-repository-references.ts'

const organizationUrl = `https://${['github.com', ['deepseek', 'harness'].join('-')].join('/')}`

function repository(test: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-repository-references-'))
  test.onTestFinished(() => {
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  })
  function git(args: string[], input?: string): string {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: join(root, 'global.gitconfig'),
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_AUTHOR_NAME: 'Repository reference test',
        GIT_AUTHOR_EMAIL: 'repository-reference@example.invalid',
        GIT_COMMITTER_NAME: 'Repository reference test',
        GIT_COMMITTER_EMAIL: 'repository-reference@example.invalid',
      },
      ...(input === undefined ? {} : { input }),
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  }
  function write(file: string, source: string): void {
    const path = join(root, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, source)
  }
  git(['init', '--quiet'])
  write('tracked.md', 'release tags\n')
  git(['add', 'tracked.md'])
  const tree = git(['write-tree'])
  const commit = git(['commit-tree', tree, '-m', 'fixture'])
  git(['update-ref', 'HEAD', commit])
  return { root, git, write, commit, tree }
}

/** Two commit object bodies whose object names share at least `length` leading hexadecimal digits. */
function collidingCommitBodies(tree: string, length: number): [string, string] {
  const algorithm = tree.length === 64 ? 'sha256' : 'sha1'
  const seen = new Map<string, string>()
  for (let index = 0; ; index += 1) {
    const body = `tree ${tree}\nauthor T <t@example.invalid> 0 +0000\ncommitter T <t@example.invalid> 0 +0000\n\ncollision ${String(index)}\n`
    const prefix = createHash(algorithm).update(`commit ${String(Buffer.byteLength(body))}\0${body}`).digest('hex').slice(0, length)
    const previous = seen.get(prefix)
    if (previous !== undefined) return [previous, body]
    seen.set(prefix, body)
  }
}

describe('unique object-name prefix search', () => {
  it.each([
    [['aaa1', 'bbb2', 'ccc3'], 'bbb', 'bbb2'],
    [['abc1', 'abc2'], 'abc', undefined],
    [['a1', 'b2'], 'b', 'b2'],
    [['abc', 'abd'], 'abc', 'abc'],
    [['abc'], 'abd', undefined],
    [['abc'], 'abcd', undefined],
    [[], 'abc', undefined],
  ] as const)('finds in %j the one name starting with %s', (objects, prefix, expected) => {
    expect(uniquePrefixMatch(objects, prefix)).toBe(expected)
  })
})

describe('maintained repository reference policy', () => {
  it('treats canonical uv artifact sizes as numeric metadata while checking quoted and prose references', () => {
    const commit = String(6_344_383)
    const commits = new Set([commit])
    const artifact = `{ url = "https://files.pythonhosted.org/pillow.whl", hash = "sha256:${'a'.repeat(64)}", size = ${commit}, upload-time = "2026-07-01T11:54:15.756Z" },`
    expect(findRepositoryReferences('python/sdk/uv.lock', artifact, commits)).toEqual([])
    expect(findRepositoryReferences('python/sdk/uv.lock', `sdist = ${artifact.slice(0, -1)}`, commits)).toEqual([])
    expect(findRepositoryReferences('python/sdk/uv.lock', artifact.replace(`size = ${commit}`, `size = "${commit}"`), commits)).toHaveLength(1)
    expect(findRepositoryReferences('python/sdk/uv.lock', artifact.replace('pillow.whl', `${commit}.whl`), commits)).toHaveLength(1)
    expect(findRepositoryReferences('python/sdk/uv.lock', `size = ${commit}`, commits)).toHaveLength(1)
    expect(findRepositoryReferences('docs/example.md', artifact, commits)).toHaveLength(1)
  })

  for (const file of [
    'docs/indus-orbit-local-verification-2026-10-22.json',
    'docs/indus-orbit-workstation-verification-2026-10-27.json',
    'docs/indus-orbit-terminal-distribution.proposal.json',
  ]) {
    it(`validates source-revision data and rejects prose through the repository scanner for ${file}`, (test) => {
      const subject = repository(test)
      const document = file.endsWith('proposal.json') ? { upstream: { commit: subject.commit } } : { sourceBase: subject.commit }
      subject.write(file, JSON.stringify(document, null, 2))
      expect(scanRepositoryReferences(subject.root)).toEqual([])
      subject.write(file, JSON.stringify({ ...document, note: subject.commit }, null, 2))
      expect(scanRepositoryReferences(subject.root)).toEqual([{ file, line: file.endsWith('proposal.json') ? 5 : 3, kind: 'commit-hash' }])
    })
  }

  it('classifies exact JSON source-revision fields while retaining prose and unrelated-field checks', () => {
    const commit = '0123456789abcdef0123456789abcdef01234567'
    const commits = new Set([commit])
    const receipt = 'docs/indus-orbit-workstation-verification-2026-10-27.json'
    const source = JSON.stringify({ sourceBase: commit, note: commit }, null, 2)
    expect(findRepositoryReferences(receipt, source, commits)).toEqual([{ file: receipt, line: 3, kind: 'commit-hash' }])
    expect(findRepositoryReferences('docs/another-record.json', source, commits)).toHaveLength(2)
    expect(findRepositoryReferences(receipt, `sourceBase: ${commit}`, commits)).toHaveLength(1)
    expect(findRepositoryReferences(receipt, JSON.stringify({ sourceBase: commit.slice(0, 7) }, null, 2), new Set([commit.slice(0, 7)])))
      .toHaveLength(1)
    const proposal = 'docs/indus-orbit-terminal-distribution.proposal.json'
    expect(findRepositoryReferences(proposal, JSON.stringify({ upstream: { commit } }, null, 2), commits)).toEqual([])
    expect(findRepositoryReferences(proposal, JSON.stringify({ commit }, null, 2), commits)).toHaveLength(1)
    expect(findRepositoryReferences(receipt, JSON.stringify({ sourceBase: commit, note: organizationUrl }, null, 2), commits))
      .toEqual([{ file: receipt, line: 3, kind: 'organization-url' }])
  })

  it('permits only the independent kit repository and its source URLs', () => {
    for (const suffix of ['', '.git', '/tree/main/packages/entry']) {
      expect(findRepositoryReferences('package.json', `${organizationUrl}/libreoffice-kit${suffix}`, new Set())).toEqual([])
    }
    for (const suffix of ['-other', '.example', 's']) {
      expect(findRepositoryReferences('package.json', `${organizationUrl}/libreoffice-kit${suffix}`, new Set())).toHaveLength(1)
    }
  })

  it('rejects complete and abbreviated commit identifiers in tracked, staged, and new files', (test) => {
    const fixture = repository(test)
    fixture.write('tracked.md', `release\n${fixture.commit}\n${fixture.commit.toUpperCase()}\n`)
    fixture.write('staged.md', fixture.commit.slice(0, 7))
    fixture.git(['add', 'staged.md'])
    fixture.write('new.md', `\0${fixture.commit.slice(0, 12)}`)

    expect(scanRepositoryReferences(fixture.root)).toEqual(expect.arrayContaining([
      { file: 'tracked.md', line: 2, kind: 'commit-hash' },
      { file: 'tracked.md', line: 3, kind: 'commit-hash' },
      { file: 'staged.md', line: 1, kind: 'commit-hash' },
      { file: 'new.md', line: 1, kind: 'commit-hash' },
    ]))
    expect(scanRepositoryReferences(fixture.root)).toHaveLength(4)
  })

  it('checks available unreachable commits without requiring a branch or network', (test) => {
    const fixture = repository(test)
    const unreachable = fixture.git(['commit-tree', fixture.tree, '-m', 'unreachable fixture'])
    fixture.write('unreachable.md', unreachable)
    expect(scanRepositoryReferences(fixture.root)).toEqual([
      { file: 'unreachable.md', line: 1, kind: 'commit-hash' },
    ])
  })

  it('does not fetch missing commits from a partial clone\'s promisor remote', (test) => {
    const remote = repository(test)
    remote.git(['config', 'uploadpack.allowFilter', 'true'])
    const clone = join(remote.root, 'partial-clone')
    remote.git(['clone', '--filter=blob:none', '--no-local', remote.root, clone])
    const missing = remote.git(['commit-tree', remote.tree, '-p', remote.commit, '-m', 'remote-only fixture'])
    remote.git(['update-ref', 'HEAD', missing])
    remote.write('partial-clone/new.md', missing)

    expect(scanRepositoryReferences(clone)).toEqual([])
    expect(execFileSync('git', ['cat-file', '--batch-check'], {
      cwd: clone,
      encoding: 'utf8',
      env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
      input: `${missing}\n`,
    }).trim()).toBe(`${missing} missing`)
  })

  it('accepts blobs, trees, unknown hex, long digests, and identifiers embedded in alphanumeric words', (test) => {
    const fixture = repository(test)
    const blob = fixture.git(['hash-object', '-w', '--stdin'], 'blob fixture')
    fixture.write('accepted.md', [
      blob,
      fixture.tree,
      '0'.repeat(40),
      `${fixture.commit}${'0'.repeat(24)}`,
      fixture.commit.slice(0, 6),
      `prefix${fixture.commit}`,
      `${fixture.commit}suffix`,
      'dsh-v0.0.1-rc.1',
    ].join('\n'))
    expect(scanRepositoryReferences(fixture.root)).toEqual([])
  })

  it('accepts a prefix that two available commits share and rejects a longer unique prefix', (test) => {
    const fixture = repository(test)
    const [first, second] = collidingCommitBodies(fixture.tree, 7).map(body =>
      fixture.git(['hash-object', '-t', 'commit', '-w', '--stdin'], body))
    if (first === undefined || second === undefined) throw new Error('fixture must write two commits')
    let shared = 0
    while (first[shared] === second[shared]) shared += 1
    expect(shared).toBeGreaterThanOrEqual(7)
    fixture.write('ambiguous.md', first.slice(0, 7))
    fixture.write('unique.md', first.slice(0, shared + 1))
    expect(scanRepositoryReferences(fixture.root)).toEqual([{ file: 'unique.md', line: 1, kind: 'commit-hash' }])
  })

  it('accepts hexadecimal branch names that do not match the referenced commit identifier', (test) => {
    const fixture = repository(test)
    const branch = 'b'.repeat(12)
    fixture.git(['update-ref', `refs/heads/${branch}`, fixture.commit])
    fixture.write('branch.md', branch)
    expect(scanRepositoryReferences(fixture.root)).toEqual([])
  })

  it('excludes only ignored new files, vendored sources, frozen notes, and deleted files', (test) => {
    const fixture = repository(test)
    fixture.write('.gitignore', 'ignored.md\ntracked-ignore.md\n')
    fixture.write('ignored.md', fixture.commit)
    fixture.write('vendor/project/file.md', `${fixture.commit}\n${organizationUrl}`)
    fixture.write('.agents/notes/archived/process/frozen.md', `${fixture.commit}\n${organizationUrl}`)
    fixture.write('tracked-ignore.md', fixture.commit)
    fixture.git(['add', '--force', 'tracked-ignore.md'])
    unlinkSync(join(fixture.root, 'tracked.md'))

    expect(scanRepositoryReferences(fixture.root)).toEqual([
      { file: 'tracked-ignore.md', line: 1, kind: 'commit-hash' },
    ])
  })

  it.skipIf(process.platform === 'win32')('inspects dangling symlink targets without following files outside the tree', (test) => {
    const fixture = repository(test)
    symlinkSync(`../${fixture.commit}`, join(fixture.root, 'reference-link'))
    symlinkSync('../outside', join(fixture.root, 'ordinary-link'))
    expect(scanRepositoryReferences(fixture.root)).toEqual([
      { file: 'reference-link', line: 1, kind: 'commit-hash' },
    ])
  })

  it('rejects literal, encoded, escaped, case-varied, and compatibility forms of the organization URL', () => {
    const fullwidth = organizationUrl.split('').map(character =>
      String.fromCodePoint(character.charCodeAt(0) + 0xfee0)).join('')
    const source = [
      organizationUrl,
      `${organizationUrl.toUpperCase()}/project`,
      organizationUrl.replaceAll('/', '\\/'),
      organizationUrl.replaceAll('/', String.raw`\u002f`),
      organizationUrl.replaceAll('/', String.raw`\x2f`),
      organizationUrl.replaceAll('/', '%2F').replace('github', '%67ithub'),
      organizationUrl.replaceAll('/', '&#47;'),
      organizationUrl.replaceAll('/', '&#x2f;'),
      organizationUrl.replaceAll('/', '&sol;').replaceAll('-', '&hyphen;'),
      fullwidth,
      `${organizationUrl}?tab=repositories`,
    ].join('\n')
    expect(findRepositoryReferences('source.md', source, new Set())).toEqual(
      source.split('\n').map((_line, index) => ({ file: 'source.md', line: index + 1, kind: 'organization-url' })),
    )
  })

  it('accepts distinct organization names and excludes the frozen and vendored paths', () => {
    expect(findRepositoryReferences('source.md', `${organizationUrl}-tools/project`, new Set())).toEqual([])
    expect(findRepositoryReferences('vendor/project/source.md', organizationUrl, new Set())).toEqual([])
    expect(findRepositoryReferences('.agents/notes/archived/process/frozen.md', organizationUrl, new Set())).toEqual([])
    expect(findRepositoryReferences('.agents/notes/implemented/process/current.md', organizationUrl, new Set()))
      .toEqual([{ file: '.agents/notes/implemented/process/current.md', line: 1, kind: 'organization-url' }])
  })
})
