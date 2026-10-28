---
description: "Build-selected DeepSeek Harness and Indus Orbit brand occupants; for maintainers choosing client identity and checking slot lifetimes."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-official

English | [中文](README.zh.md)

## Summary

This fork gives an `indus-orbit` client build the uppercase I/O pixel mark in the sidebar and conversation hero, with a dominant H wordmark, its Harness expansion and the Indus Orbit Foundation identity. The `official` profile retains DeepSeek Harness branding; unselected profiles retain shell fallbacks. This package has no runtime state and does not affect model requests.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The shipped Web bundle mounts this plugin. The named `DSH_BUILD_CLIENT_PROFILE=indus-orbit` build profile owns the I/O Harness title and public identity; `official` retains the upstream identity. The [Indus Orbit preview reference](../../../docs/indus-orbit-terminal-preview.md) defines the fork's distribution limits.

### Choosing the profile

`DSH_CLIENT_BUILD_PROFILE` selects the occupants. `indus-orbit` fills the sidebar mark/name and hero mark together. Its code-rendered uppercase I/O raster master stays static, and the conversation locale owns the approved English line in both interface languages. `official` fills only the upstream sidebar; other values register no occupants. The plugin validates in every profile.

### Replacing the brand

Another identity can leave this package out and mount a replacement occupant package. Neither this fork nor a replacement needs to rewrite the generic sidebar, execution controls or session state. Build-time brand selection does not connect Messaging accounts or enable providers.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Each selected occupant set installs through nested `ctx.slots.inject()` calls. Indus Orbit also waits on the hero declaration; all three occupants withdraw together when a required declaration collapses and return after redeclaration, without a partial brand mix during HMR. The browser half is [`src/client/index.ts`](src/client/index.ts); the node half is an empty Loader seat. The browser title is a build-environment concern (`DSH_CLIENT_TITLE`), outside the slot system.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the brand surface is not enough. They move from the slots this package occupies to the shell that renders them.

- [ui-sidebar](../ui-sidebar/README.md) — declares `sidebar.brand.mark` and `sidebar.brand.name` and renders their fallbacks.
- [ui-conversation](../ui-conversation/README.md) — declares `conversation.hero.brand.mark` in the hero.
- [Web client architecture](../../../docs/subsystems/web-client.md) — how browser plugin rows load and register slots.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package contributes browser presentation only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define how brand presentation is supplied. They are current package constraints, not a brand-design comparison or a task backlog.

- **Build-selected identity** — choosing another identity requires an explicit build profile or a replacement occupant package.
- **The browser title is independent** — `DSH_CLIENT_TITLE` selects title text at build time rather than through a UI slot.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
