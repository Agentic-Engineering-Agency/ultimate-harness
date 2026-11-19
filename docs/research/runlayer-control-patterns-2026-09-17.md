# Runlayer control patterns and UH applicability

Evidence inspected: 2026-09-17. This is research, not an implementation or security certification claim. Runlayer descriptions below are first-party vendor statements, not independently reproduced behavior.

## Sources

- [Runlayer overview](https://www.runlayer.com/): governed MCP gateway, identity and access policy, runtime scanning, discovery and spend visibility.
- [Runlayer and AARM](https://www.runlayer.com/blog/runlayer-and-aarm-partner-to-secure-enterprise-agents): interception before action, policy evaluation and enforcement, and tamper-evident audit. The article claims Extended Conformance; this investigation did not independently validate that claim or inspect the conformance tests.
- [MCP Tunnels](https://www.runlayer.com/blog/anthropic-mcp-tunnels): outbound-initiated connectivity, mTLS, OAuth, group-scoped gateway access, runtime scanning, and exportable events. These describe their integration, not features already present in UH.

## Applicable lessons

| Pattern | Application to UH | Authority and limitations |
|---|---|---|
| Enforce before effects | Evaluate an action before dispatch; preserve deterministic denials regardless of semantic scores. | JEV is advisory evidence, not a permission grant or a security boundary. |
| Separate recommendation from authorization | Recommend an eligible runtime/model or escalation based on bounded task evidence. | Policy defines allowed choices; human gates and scope restrictions remain authoritative. |
| Explain why execution was allowed | Preserve decision input references, selected route, provider outcome, policy outcome, and actual run references. | Do not log credentials, raw sensitive documents, or claim signed/tamper-proof evidence without implementing and verifying it. |
| One enforcement point | Keep UH as sole controller for a live attempt. | External integrations must not start a second controller for the same attempt. |
| Governed tool inventory | Consider capability discovery and eligibility before semantic ranking. | A listed adapter is not necessarily installed, healthy, affordable, or authorized. |
| Export operational facts | Retain observed usage, latency, outcomes and uncertainty. | No inferred savings or universal speed claims from one request. Existing telemetry policy still applies. |

## Defer rather than copy

Enterprise SSO, OAuth brokering, MCP reverse tunnels, a hosted gateway, security-model training, and broad endpoint discovery are not prerequisites for the current progressive-decision implementation. Adding them now would expand product scope and authority. Runlayer's public material does not expose enough internals to reproduce its detection performance, training, thresholds, false-positive rates, or actual unit costs.

## Evidence selection as another JEV application

For ranking sets of posts, websites, or articles, a possible pipeline is: authorized acquisition and deduplication in code; stable document/fragment IDs; bounded relevance, novelty, evidence and applicability judgments; selection in code with diversity controls; optional generative synthesis over selected text only. Preserve source quotations and links. Popularity is not evidence quality. External text is untrusted and cannot authorize implementation or change scope. No collector or large-corpus benchmark was implemented in this investigation.
