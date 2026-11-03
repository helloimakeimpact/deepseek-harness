/** Keyless built I/O H rehearsal; uses disposable profile/home and a synthetic model gateway only.
 * Requires current `pnpm run build --profile indus-orbit` artifacts and a cached macOS arm64 primary runtime.
 * Run with `node --import tsx/esm scripts/verify-indus-desktop-host.ts --runtime <directory> --receipt <JSON>`.
 */
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises'
import { watch } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { prepareDevelopmentProject } from '../apps/desktop/scripts/development-project.ts'
import { createPluginProfile } from '../apps/desktop/src/project-manager.ts'
import { DesktopHostProcess } from '../apps/desktop/src/host-process.ts'
import { IndusModelBroker } from '../apps/desktop/src/indus-model-broker.ts'
import { DESKTOP_HOST_PROTOCOL_VERSION } from '../apps/desktop/src/host-protocol.ts'

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected an object in rehearsal metadata')
  return value as Record<string, unknown>
}

const source = resolve(fileURLToPath(new URL('..', import.meta.url)))
const { values } = parseArgs({ options: { runtime: { type: 'string' }, receipt: { type: 'string' } } })
if (values.runtime === undefined || values.receipt === undefined) throw new Error('Supply --runtime <primary-runtime directory> and --receipt <output JSON>')
const output = resolve(values.receipt)
const root = await mkdtemp('/private/tmp/indus-owned-host-')
const runtime = join(root, 'runtime'), profile = join(root, 'profile'), home = join(root, 'home')
const proof = join(profile, 'proof.json')
let host: DesktopHostProcess | undefined
let watcher: ReturnType<typeof watch> | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let paidOperations = 0
const broker = new IndusModelBroker((path, body, _signal, requestId) => {
  if (path === '/v1/models') return Promise.resolve(Response.json({ object: 'list', data: [{ id: 'io/harness-primary', name: 'I/O test route', context_window: 32_768, max_output_tokens: 4096, input_modalities: ['text'] }] }))
  assert.ok(body !== undefined && /^[A-Za-z0-9_-]{32}$/.test(requestId ?? ''))
  paidOperations++
  return Promise.resolve(new Response('data: {"choices":[{"delta":{"role":"assistant","content":"hello"},"index":0,"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{},"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":8,"completion_tokens":1}}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } }))
}, { requestBytes: 1_048_576, responseBytes: 65_536, concurrentRequests: 4, requestTimeoutMs: 15_000 })

try {
  await mkdir(home)
  const version = record(JSON.parse(await readFile(join(source, 'apps/cli/package.json'), 'utf8'))).version
  if (typeof version !== 'string') throw new Error('Missing CLI version')
  const pnpmVersion = record(JSON.parse(await readFile(join(source, 'apps/desktop/node_modules/pnpm/package.json'), 'utf8'))).version
  if (typeof pnpmVersion !== 'string') throw new Error('Missing package manager version')
  prepareDevelopmentProject({ projectDir: runtime, cliDir: join(source, 'apps/cli'), hostDir: join(source, 'apps/desktop-host'), dependencyDir: join(source, 'node_modules/.pnpm/node_modules'), release: { schemaVersion: 1, version, hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION, nodeVersion: process.versions.node, pnpmVersion }, target: process.platform === 'darwin' && process.arch === 'arm64' ? 'mac-arm64' : (() => { throw new Error('This runtime rehearsal currently requires macOS arm64') })() })
  createPluginProfile(profile)
  const probeRoot = join(profile, 'probe')
  await mkdir(probeRoot)
  await writeFile(join(probeRoot, 'package.json'), JSON.stringify({ name: 'indus-smoke-probe', version: '1.0.0', type: 'module', main: 'index.mjs' }))
  const manifestPath = join(profile, 'package.json')
  const manifest = record(JSON.parse(await readFile(manifestPath, 'utf8')))
  manifest.dependencies = { ...record(manifest.dependencies), 'indus-smoke-probe': 'file:./probe' }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  await mkdir(join(profile, 'node_modules'))
  await symlink(probeRoot, join(profile, 'node_modules/indus-smoke-probe'))
  const llm = pathToFileURL(join(source, 'packages/llm/llm/lib/index.js')).href
  await writeFile(join(probeRoot, 'index.mjs'), `
    import { writeFileSync, renameSync } from 'node:fs';
    import { BlockAssembler, createUserMessage } from ${JSON.stringify(llm)};
    export const name = 'indus-smoke-probe'; export const inject = ['llm', 'agentDefaultModel'];
    export function apply(ctx) {
      let invoked = false;
      const listener = message => {
        if (invoked || message?.type !== 'update-tasks' || message.action !== 'inspect') return;
        invoked = true;
        let stage = 'selection'; let selection; let providers;
        void (async () => {
          await ctx.loader.await(); for (const entry of ctx.loader.entries()) await entry.fiber?.await(); selection = ctx.agentDefaultModel.currentSelection();
          providers = { list:ctx.llm.listProviders().map(item => item.id), overlays:ctx.get('profileContext')?.overlays?.map(item=>({id:item.id,insert:item.insert?.map(row=>row.id)})), entries:[...ctx.loader.entries()].filter(item=>['desktop-indus-model','llm-deepseek-account','agent-default-model'].includes(item.options.id)).map(item=>({id:item.options.id,disabled:item.options.disabled,effectiveDisabled:item.disabled,config:item.options.id==='agent-default-model'?item.options.config:undefined,state:item.fiber?.state,exports:Object.keys(item.moduleNamespace??{})})) }; stage = 'catalog';
          const models = await ctx.llm.listModels('indus-orbit');
          stage = 'stream'; const assembler = new BlockAssembler();
          for await (const chunk of ctx.llm.stream({ ...selection, maxTokens: 32,
            messages: [createUserMessage({ content: [{type:'text',text:'Synthetic native smoke.'}], source:{kind:'model',...selection} })]
          })) assembler.push(chunk);
          return { ready:true, selection, models:models.length, finish:assembler.finish.kind, providers: providers.list, upstreamAccountDisabled: [...ctx.loader.entries()].filter(item=>item.options.id==='llm-deepseek-account').every(item=>item.disabled && item.fiber===undefined) };
        })().then(value => {
          writeFileSync(${JSON.stringify(proof+'.tmp')}, JSON.stringify(value)); renameSync(${JSON.stringify(proof+'.tmp')}, ${JSON.stringify(proof)});
        }, error => { writeFileSync(${JSON.stringify(proof+'.tmp')}, JSON.stringify({ready:false,stage,selection,providers,profileEnvironment:process.env.DSH_CLIENT_BUILD_PROFILE,entry:process.argv[1],error:String(error?.message ?? 'Model probe failed').replace(/([?&](?:token|auth)=)[^\\s&]+/g,'$1[redacted]').slice(0,1000)})); renameSync(${JSON.stringify(proof+'.tmp')}, ${JSON.stringify(proof)}); });
      };
      ctx.effect(() => { process.on('message', listener); return () => process.off('message', listener); });
    }
  `)
  await writeFile(join(profile, 'cordis.patch.yml'), '- insert:\n    - id: indus-smoke-probe\n      name: indus-smoke-probe\n')
  const result = new Promise<Record<string, unknown>>((resolve, reject) => {
    watcher = watch(profile, (_event, name) => {
      if (name !== 'proof.json') return
      void readFile(proof, 'utf8').then(text => record(JSON.parse(text))).then(resolve, reject)
    })
    watcher.on('error', reject)
    timer = setTimeout(() => { reject(new Error('Built Host probe timed out')) }, 45_000)
  })
  void result.catch(() => undefined)
  const environment = {
    PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER, TMPDIR: process.env.TMPDIR,
    DSH_HOME: home, DSH_CLIENT_BUILD_PROFILE: 'indus-orbit', DSH_TELEMETRY_DISABLED: '1',
  }
  host = new DesktopHostProcess(process.execPath, runtime, profile, undefined, environment, undefined,
    resolve(values.runtime),
    { pnpm: join(source, 'apps/desktop/node_modules/pnpm/bin/pnpm.mjs'), nodeBin: dirname(process.execPath) },
    undefined, () => broker.start())
  await host.start()
  await host.updateTasks('inspect')
  const received = await result
  if (received.ready !== true) throw new Error(JSON.stringify(received))
  assert.equal(received.ready, true)
  assert.deepEqual(received.selection, { provider: 'indus-orbit', model: 'io/harness-primary' })
  assert.equal(received.finish, 'stop')
  assert.equal(received.upstreamAccountDisabled, true)
  assert.ok(Array.isArray(received.providers) && received.providers.includes('indus-orbit'))
  assert.equal(paidOperations, 1)
  await writeFile(output, JSON.stringify({ date: new Date().toISOString().slice(0, 10), state: 'Verified', builtHost: true,
    profile: 'desktop / indus-orbit', ...received, syntheticGatewayOperations: paidOperations,
    realProviderCalls: 0, originalAccountStateTouched: false, hostedCreditGrant: false }, null, 2)+'\n')
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown built Host error'
  await writeFile(output, JSON.stringify({ date: new Date().toISOString().slice(0, 10), state:'Partial', builtHost:false,
    error: message.replace(/([?&](?:token|auth)=)[^\s&]+/g,'$1[redacted]').slice(0,1500),
    realProviderCalls:0, originalAccountStateTouched:false },null,2)+'\n')
  process.exitCode = 1
} finally {
  clearTimeout(timer)
  watcher?.close()
  try { await broker.close() } finally { await host?.stop(true) }

  await rm(root, { recursive: true, force: true })
}
