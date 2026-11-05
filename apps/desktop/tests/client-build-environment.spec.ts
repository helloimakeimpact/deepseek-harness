/** A direct profile-selected build embeds the same owned OAuth identity as a root build. */
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { desktopClientBuildEnvironment } from '../scripts/client-build-environment.ts'
import { indusAuthConfig } from '../src/indus-auth.ts'
const root = fileURLToPath(new URL('../../..', import.meta.url))

it('keeps the Indus selector through repository version resolution', () => {
  const environment = desktopClientBuildEnvironment(root, { DSH_BUILD_CLIENT_PROFILE: 'indus-orbit' })
  expect(environment).toMatchObject({
    DSH_CLIENT_BUILD_PROFILE: 'indus-orbit', DSH_CLIENT_TITLE: 'I/O Harness — Indus Orbit',
    DSH_CLIENT_INDUS_OAUTH_CLIENT_ID: 'cf26c996-8c19-42c6-82ff-f0b6ccafd3ee',
    DSH_CLIENT_INDUS_OAUTH_CALLBACK_PORT: '43189',
  })
  expect(indusAuthConfig(environment)).toMatchObject({ clientId: 'cf26c996-8c19-42c6-82ff-f0b6ccafd3ee', callbackPort: 43189 })
  expect(environment.DSH_CLIENT_VERSION).toBeTruthy()
  expect(environment.DSH_CLIENT_COMMIT_HASH).toMatch(/^[a-f0-9]{7}$/u)
  expect(environment).not.toHaveProperty('DSH_BUILD_CLIENT_PROFILE')
})

it('retains the already selected root-build public values', () => {
  const environment = { DSH_CLIENT_BUILD_PROFILE: 'indus-orbit', DSH_CLIENT_VERSION: '0.2.1-rc.3',
    DSH_CLIENT_COMMIT_HASH: 'abcdef0', DSH_CLIENT_INDUS_OAUTH_CLIENT_ID: 'registered-client', DSH_CLIENT_INDUS_OAUTH_CALLBACK_PORT: '43189' }
  expect(desktopClientBuildEnvironment(root, environment)).toEqual(environment)
})

it('keeps an official build free of inherited Indus OAuth configuration', () => {
  expect(desktopClientBuildEnvironment(root, { DSH_BUILD_CLIENT_PROFILE: 'official',
    DSH_CLIENT_INDUS_OAUTH_CLIENT_ID: 'stale-client' })).toMatchObject({ DSH_CLIENT_BUILD_PROFILE: 'official', DSH_CLIENT_TITLE: 'DeepSeek Harness' })
  expect(desktopClientBuildEnvironment(root, { DSH_BUILD_CLIENT_PROFILE: 'official',
    DSH_CLIENT_INDUS_OAUTH_CLIENT_ID: 'stale-client' })).not.toHaveProperty('DSH_CLIENT_INDUS_OAUTH_CLIENT_ID')
})
