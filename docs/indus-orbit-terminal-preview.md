# Indus Orbit Harness preview

English | [中文](indus-orbit-terminal-preview.zh.md)

## Summary

This reference defines I/O Harness (I/O H), the Indus Orbit fork of DeepSeek Harness, and its local build and distribution limits. Indus Orbit uses the descriptor “The General Intelligence Foundation of India.” I/O API, Harness and Community are separate offerings. Branding does not join accounts, activate providers or change execution permissions.

## Table of Contents

- [Source and identity](#source-and-identity)
- [Local build](#local-build)
- [Download publication](#download-publication)
- [Compatibility and attribution](#compatibility-and-attribution)
- [Dev Note](#dev-note)

<a id="source-and-identity"></a>
## Source and identity

The upstream base is [dsh-v0.2.1-rc.3](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.3), fetched on 27 October 2026. This is an upstream release candidate with local fork changes. The previous rc.2 checkout and its dirty files remain preserved separately; it is not the active Harness source.

The `indus-orbit` client build uses the bracketed `[H]` mark with the existing pixel I/O artwork as an upper-right signature, a dominant H wordmark, the Harness expansion and Indus Orbit Foundation identity. Owned raster marks are rendered from the vector geometry. The [brand occupant package](../packages/client/ui-brand-official/README.md) fills the sidebar and conversation hero through existing slots. Session handling, tools, plugins and the agent loop keep the upstream architecture.

<a id="local-build"></a>
## Local build

The pinned Node and pnpm requirements are in [package.json](../package.json). The named build profile owns its public title and branding; arbitrary inherited title values cannot override it:

```sh
pnpm run build:indus-orbit
```

`DSH_BUILD_CLIENT_PROFILE=indus-orbit` selects the same named profile for build and packaging subprocesses. `pnpm run build:official` retains upstream branding. Build profiles select artifact identity; runtime compositions still use supported `dsh` profiles such as `web` and the Desktop-owned composition. The client build record binds the selected values to Web, dynamic-client and native-shell artifacts.

Native previews use the filesystem-safe name `IO Harness`, displayed as I/O Harness. The existing `io-ws` protocol, `local.indusorbit.workstation.preview` identifier, `IO W-S` Electron data directory and durable `Indus Orbit Workstation Data/harness` home remain stable to preserve local data. An explicit `DSH_HOME` still overrides the Harness home.

The native `indus-orbit` profile requires its own Indus Orbit OAuth identity before starting the Host. Missing public client configuration keeps an isolated sign-in window open without a provider fallback. The main process owns PKCE, a state-bound loopback callback, bounded issuer requests and refresh credentials; only email and identity status reach the renderer. Refresh credentials use OS encryption when available, otherwise process memory. Signing out clears this device and stops its work even if credential removal fails; it does not revoke other installations' grants. The supported callback is `http://127.0.0.1:43189/indus-auth/callback`.

The named `indus-orbit` profile embeds public client ID `cf26c996-8c19-42c6-82ff-f0b6ccafd3ee` and callback port `43189`; inherited public variables cannot retarget it. These values are not secrets. The website must deploy the matching consent page and ID. Database, Storage, Realtime and I/O function restrictions must reject identity-only OAuth tokens before activation. Genuine hosted sign-in, refresh and revocation require separate acceptance.

The trusted Desktop Host overlay disables the upstream DeepSeek account, its account settings, product analytics and session telemetry. The optional direct-key DeepSeek adapter and pi-ai provider connections remain available separately. The upstream `official` profile retains its own behavior.

The owned I/O provider uses a main-process loopback broker. OAuth access and refresh credentials stay in main; the Host receives a random in-memory socket capability through private IPC, never through environment variables, arguments, renderer state or profile configuration. Browser origins and unlisted routes are refused. The broker bounds bytes, concurrency and duration, preserves JSON/SSE bytes, generates a unique paid-attempt ID and aborts on sign-out or Host shutdown. The maintained pi-ai OpenAI adapter handles streaming, tool history and usage; automatic retries are disabled for this funded route.

New defaults select `indus-orbit` / `io/harness-primary` before user patches, preserving explicit saved choices and existing sessions. Reviewed gateway metadata supplies capacities and the exact primary or owner-approved temporary alias; other model families are never a silent fallback. Use **Connect I/O credits…** in the application menu for separate first-party funding approval. The matched website/backend and eligible provider route must be deployed before genuine funded execution can pass; identity sign-in alone is insufficient.

Native model transport and supplier checks are recorded separately in the [I/O model verification receipt](indus-orbit-model-verification-2026-10-28.json). A successful direct-supplier test does not establish a genuine hosted workspace-credit grant or a public installer.

The fork permits unsigned local packaging only. Its updater rejects upstream feed and upload resolution, its installed updater is disabled, and its mandatory-update service is disabled. Signing credentials, accounts and publication destinations need a separately reviewed fork release configuration. The [verification record](indus-orbit-workstation-verification-2026-10-27.json) states the actual commands, outcomes and remaining limits; it is the authority for whether an installer has been produced or tested.

<a id="download-publication"></a>
## Download publication

The [distribution proposal](indus-orbit-terminal-distribution.proposal.json) records publication state. A source archive and an unsigned local installer are distinct from a published, qualified release. Only actual artifact bytes may receive a filename, size or SHA-256; empty artifact lists do not represent downloads.

Before a public website download is enabled, its release record needs the fork version, exact source revision and patch digest, channel, platform/architecture, filename, byte length, SHA-256, HTTPS destination, compatibility evidence and signing/notarisation results. Preserve [LICENSE](../LICENSE), [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) and each included licence notice.

An upstream installer must not be presented as I/O Harness. No public Indus Orbit update or publication endpoint is configured by this preview. The [Desktop reference](../apps/desktop/README.md) owns the native packaging and runtime details.

<a id="compatibility-and-attribution"></a>
## Compatibility and attribution

Local verification records its exact scope and host; it does not qualify other operating systems or architectures. Current session compatibility belongs to [Session format status](session-format-status.md) and the [upgrade guides](upgrade-guide/). Use a separate test Harness home before opening older session data, and verify migrations on copies.

DeepSeek Harness code retains its MIT copyright and attribution. The Indus Orbit identity identifies this fork. Provider accounts, costs, consent, sandboxing and local execution remain governed by their real configuration and policies.

<a id="dev-note"></a>
## Dev Note

The filename retains its earlier Terminal reference so existing local links remain valid. The dated rc.2 verification record is historical evidence; the verification record owns current local results. The earlier W-S DMG is held and is not an I/O Harness release.
