# Turn-routing experiment: turn-routing-v1

Introduced 2026-11-05 (CET). Activation is per Pi session after `/reload` or restart, not the commit timestamp. Each session records `jev-policy` with its activation timestamp. Decisions, committed pins and generation requests carry `routingPolicy: turn-routing-v1`. Unmarked records belong to the previous policy; do not merge the two populations when assessing switching.

## Pre-change snapshot

Local session telemetry inspected on 2026-11-05, covering that local calendar day up to the investigation (UTC generation timestamps 2026-11-04T23:00:06.471Z through 23:08:28.963Z):

- Two sessions with generation telemetry, deduplicated across inherited/copied entries.
- 15 generation requests: 12 Astra, 3 Sol.
- Zero within-session Sol → Astra transitions.
- One monitoring evaluation, retaining Sol low; keep-current option probability 0.92.
- No initial routing decisions recorded within this time window.

This is a small partial-day baseline, not evidence of classifier quality. The old implementation never applied monitoring recommendations automatically.

## New behaviour

Reassess each new user turn and apply model selection after authentication. Keep the route stable throughout tool continuations. Prefer task fit over cache savings; escalate for demanding work, downgrade for independently routine requests, and retain the model on ambiguous continuations or classifier failure. Previously suggested alternatives remain eligible. Auxiliary calls do not commit switches.

Advertise the minimum context/output limits of the available routes to retain conservative compaction budgets. Scope adaptive effort history to the most recent route pin. Existing overlarge histories may still require compaction. Cross-model provider-history compatibility and real cache/latency effects require live observation.

## Analysis rules

- Count committed transitions from `jev-pin` with `outcome: switch-applied`, comparing `previousPin.target` to `target`. Effort-only changes are not model switches.
- `jev-monitor` with `switch-pending-auth` is a recommendation/attempt, not proof of a switch.
- `jev-generation` confirms a concrete payload was requested, not that generation succeeded.
- Deduplicate decisions by decisionId, generations by requestId, other entries by entry ID across forked histories.
- Separate model distribution, switch frequency, direction, classifier failures, latency, and generation cache/usage. More switching is not itself a quality improvement.

Rollback: set `jevRouter.monitor` to false in the global settings override to retain the first route, or restore the previous package revision. Reload after either change.
