# GPT Auto — Jev routing through OpenRouter

A fork of [pi-jev-router](https://github.com/mejiasd3v/pi-jev-router), based on upstream **0.5.0**, commit `b068a9b1102939d42114eec6b62ee1308a5364d8`.

The **gpt-auto** profile uses Jev on OpenRouter to select a Codex model and reasoning effort once per session. The chosen model stays pinned. Monitoring can suggest a fork, but never switches models automatically.

## Install on any machine

Requires Pi with its native classifier API (`modelRegistry.classify` and `findOfType`; verified on Pi 1.4.0) and Node.js 22.19 or newer.

```sh
pi install git:github.com/goulinkh/pi-jev-router@v0.5.0-openrouter.2
```

The version tag pins the package. For an immutable pin, replace the tag with its full commit SHA. Keep only one installation: remove the original npm router or any local adaptation before installing this fork.

In Pi:

```text
/login openrouter
/login openai-codex
/reload
/new
/model auto/gpt-auto
```

Existing logins can be reused. No Vercel credential is needed. Start with the actual task; `/jev` shows the profile, selected model/effort, and credential status. To make GPT Auto your startup model, select it in `/model` and press Ctrl+S. Installation does not change your startup default.

## Shared profile: gpt-auto

[`gpt-auto.json`](gpt-auto.json) ships with the pinned package, so the same install uses the same defaults across machines:

| Model | Role |
| --- | --- |
| `openai-codex/gpt-6.1-sol` | Lower-cost default for routine implementation, tests, bounded debugging, and straightforward writing. |
| `openai-codex/gpt-6-astra` | Architecture, difficult debugging, complex judgment, demanding writing, and fallback. |

Both use automatic reasoning effort. Monitoring is enabled. Adaptive Astra effort and automatic skill selection are disabled. Opus is not a route.

Jev itself is pinned to the versioned classifier **`openrouter/typesafe/jev-1.14`**, not a latest alias. Generation uses Codex directly; OpenRouter only handles Jev evaluations.

A global `jevRouter` object in `~/.pi/agent/settings.json` overrides the bundled profile **in full**. Remove that object to use the shared defaults; do not remove unrelated settings. Project settings cannot override routing. `PI_CODING_AGENT_DIR` is respected. `/jev` shows the configuration source.

Changing model/initial-effort settings does not rewrite existing session pins. Use `/new` or `/fork` for a fresh choice. Pins survive reload/resume and compaction. If classification fails initially, Astra is selected at its highest supported automatic effort. Monitoring failures retain the current pin.

## What changed from upstream

- Replaces Vercel AI SDK evaluations with Pi's native classifier API, using existing OpenRouter authentication.
- Names the selectable router `auto/gpt-auto` and bundles its shared Sol/Astra policy.
- Preserves structured route rubrics as JSON text in Pi's string-valued criteria; budget checks include serialization and framing headroom.
- Validates answers, propagates cancellation, and hides provider error bodies.
- Has no runtime npm dependencies: no bundled AI SDK or Zod.
- Retains upstream session pinning, monitoring, timeout/fallback, and optional skill/adaptive-effort behavior.

The Vercel-specific upstream test suite, its dependency lock, and test/npm-publishing workflows are not carried forward in this branch. No replacement tests were added. Verification consists of extension loading and a small synthetic OpenRouter classification, not a comprehensive regression suite. Upstream files remain in Git history. This package is distributed through GitHub, not npm.

## Privacy and cost

Routing and monitoring send selected user/assistant text excerpts to **OpenRouter/TypeSafe**. Text is not redacted and can contain secrets. Generation stays with Codex. If enabled later, adaptive effort also sends tool-result excerpts, and skill selection sends skill names/descriptions.

Jev evaluations are billed separately. The inherited `/jev` estimate uses $0.042 per million classifier input tokens, matching the catalog price when this fork was created. Failed calls can still be billed. Skill/adaptive evaluations are excluded from that estimate, and routing costs are not included in Pi's footer totals. Cache savings are not guaranteed.

Routing requests have a conservative 28,000-byte budget; long inputs may be chunked. Routing/monitoring operations share a ceiling of three times `timeoutMs` (15 seconds by default). Deferred/background generation is unsupported by this router; select a concrete model for it.

## Maintenance

Source lives on this fork's `openrouter` branch. To update a shared setup, publish a new commit/tag and explicitly change the pinned Pi package source on each machine. Do not edit Pi's managed checkout: package reconciliation can discard those edits.

[MIT](LICENSE). Original implementation by MejiasDev; OpenRouter adaptation maintained in this fork.
