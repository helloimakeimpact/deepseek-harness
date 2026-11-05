---
kind: upgrade-guide
description: The Indus Orbit desktop preview requires its own account instead of upstream provider login.
---

# Indus Orbit preview identity

English | [中文](guide.zh.md)

## Change

The `indus-orbit` desktop preview is named I/O Harness (I/O H). It requires an Indus Orbit identity before starting the Host. Upstream DeepSeek account and direct-key adapters, account settings and telemetry are disabled in this profile. Model execution remains unavailable until the owned I/O adapter is qualified. The `official` profile is unchanged. Existing data paths and the `io-ws` protocol remain stable.

## Migration

1. Preserve the old preview and user data. Do not transfer upstream account tokens into the Indus Orbit identity store.
2. Register the owned public OAuth client and deploy the matching consent page and identity-token restrictions described in [the preview reference](../../../indus-orbit-terminal-preview.md).
3. Run `pnpm run build:indus-orbit`; the named profile owns the registered public client ID and callback. A different identity project requires a reviewed profile and website registration change. Never embed a client secret or service key.
4. Verify that startup opens Indus Orbit sign-in, missing configuration starts no Host, cancellation grants no identity, and sign-out stops work. Confirm genuine sign-in and refresh on the release candidate before distributing it.
