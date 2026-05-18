import{V as e,z as t}from"./index-Cj773Jxy.js";var n=e(t()),r={title:"`.harness/` Artifact Structure",description:"`.harness/` stores Ultimate Harness project state. It should make agentic work inspectable even if the original chat session disappears."},i={contents:[{heading:`purpose`,content:"`.harness/` stores Ultimate Harness project state. It should make agentic work inspectable even if the original chat session disappears."},{heading:`file-responsibilities`,content:"`project.yaml` — project identity, issue sources, schema versions, defaults."},{heading:`file-responsibilities`,content:"`adapters/*.yaml` — adapter manifests and capabilities."},{heading:`file-responsibilities`,content:"`workflows/*.yaml` — workflow profile definitions."},{heading:`file-responsibilities`,content:"`skills/index.yaml` — discoverable skill metadata and locations."},{heading:`file-responsibilities`,content:"`specs/active/` — current canonical specs."},{heading:`file-responsibilities`,content:"`specs/archive/` — superseded or completed specs."},{heading:`file-responsibilities`,content:"`missions/`id`/mission.yaml` — canonical mission packet."},{heading:`file-responsibilities`,content:"`missions/`id`/prompt.md` — runtime-specific prompt generated from mission."},{heading:`file-responsibilities`,content:"`missions/`id`/runtime-session.yaml` — runtime IDs/status/capabilities."},{heading:`file-responsibilities`,content:"`missions/`id`/events.ndjson` — structured lifecycle events."},{heading:`file-responsibilities`,content:"`missions/`id`/artifacts/` — generated outputs not yet promoted."},{heading:`file-responsibilities`,content:"`missions/`id`/diff.patch` — captured patch for review."},{heading:`file-responsibilities`,content:"`missions/`id`/verification.yaml` — checks and results."},{heading:`file-responsibilities`,content:"`missions/`id`/review.md` — human or review-agent notes."},{heading:`file-responsibilities`,content:"`missions/`id`/promotion.yaml` — promotion decision and applied refs."},{heading:`file-responsibilities`,content:"`sandboxes/index.yaml` — active/discarded/promoted sandboxes."},{heading:`file-responsibilities`,content:"`audit/events.ndjson` — append-only project-level timeline."},{heading:`design-notes`,content:"`.harness/` should be checked into git except large logs or secrets."},{heading:`design-notes`,content:"Secrets must never be stored in `.harness/`."},{heading:`design-notes`,content:`Generated artifacts remain non-canonical until promoted.`},{heading:`design-notes`,content:`Runtime-specific details belong under mission/session records, not in core specs.`}],headings:[{id:`purpose`,content:`Purpose`},{id:`draft-layout`,content:`Draft layout`},{id:`file-responsibilities`,content:`File responsibilities`},{id:`design-notes`,content:`Design notes`}]},a=[{depth:2,url:`#purpose`,title:(0,n.jsx)(n.Fragment,{children:`Purpose`})},{depth:2,url:`#draft-layout`,title:(0,n.jsx)(n.Fragment,{children:`Draft layout`})},{depth:2,url:`#file-responsibilities`,title:(0,n.jsx)(n.Fragment,{children:`File responsibilities`})},{depth:2,url:`#design-notes`,title:(0,n.jsx)(n.Fragment,{children:`Design notes`})}];function o(e){let t={code:`code`,h2:`h2`,li:`li`,p:`p`,pre:`pre`,span:`span`,ul:`ul`,...e.components};return(0,n.jsxs)(n.Fragment,{children:[(0,n.jsx)(t.h2,{id:`purpose`,children:`Purpose`}),`
`,(0,n.jsxs)(t.p,{children:[(0,n.jsx)(t.code,{children:`.harness/`}),` stores Ultimate Harness project state. It should make agentic work inspectable even if the original chat session disappears.`]}),`
`,(0,n.jsx)(t.h2,{id:`draft-layout`,children:`Draft layout`}),`
`,(0,n.jsx)(n.Fragment,{children:(0,n.jsx)(t.pre,{className:`shiki shiki-themes github-light github-dark`,style:{"--shiki-light":`#24292e`,"--shiki-dark":`#e1e4e8`,"--shiki-light-bg":`#fff`,"--shiki-dark-bg":`#24292e`},tabIndex:`0`,icon:`<svg viewBox="0 0 24 24"><path d="M 6,1 C 4.354992,1 3,2.354992 3,4 v 16 c 0,1.645008 1.354992,3 3,3 h 12 c 1.645008,0 3,-1.354992 3,-3 V 8 7 A 1.0001,1.0001 0 0 0 20.707031,6.2929687 l -5,-5 A 1.0001,1.0001 0 0 0 15,1 h -1 z m 0,2 h 7 v 3 c 0,1.645008 1.354992,3 3,3 h 3 v 11 c 0,0.564129 -0.435871,1 -1,1 H 6 C 5.4358712,21 5,20.564129 5,20 V 4 C 5,3.4358712 5.4358712,3 6,3 Z M 15,3.4140625 18.585937,7 H 16 C 15.435871,7 15,6.5641288 15,6 Z" fill="currentColor" /></svg>`,children:(0,n.jsxs)(t.code,{children:[(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`.harness/`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`  project.yaml`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`  adapters/`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`    hermes.yaml`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`    codex.yaml`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`    claude-code.yaml`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`    pi.yaml`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`  workflows/`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`    research-docs.yaml`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`    spec-first-feature.yaml`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`    bugfix-contained.yaml`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`    adapter-design.yaml`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`    skill-authoring.yaml`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`  skills/`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`    index.yaml`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`  specs/`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`    active/`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`    archive/`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`  missions/`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`    mission-2026-05-13-docs-spine/`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`      mission.yaml`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`      prompt.md`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`      runtime-session.yaml`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`      events.ndjson`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`      artifacts/`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`      diff.patch`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`      verification.yaml`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`      review.md`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`      promotion.yaml`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`  sandboxes/`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`    index.yaml`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`  audit/`})}),`
`,(0,n.jsx)(t.span,{className:`line`,children:(0,n.jsx)(t.span,{children:`    events.ndjson`})})]})})}),`
`,(0,n.jsx)(t.h2,{id:`file-responsibilities`,children:`File responsibilities`}),`
`,(0,n.jsxs)(t.ul,{children:[`
`,(0,n.jsxs)(t.li,{children:[(0,n.jsx)(t.code,{children:`project.yaml`}),` — project identity, issue sources, schema versions, defaults.`]}),`
`,(0,n.jsxs)(t.li,{children:[(0,n.jsx)(t.code,{children:`adapters/*.yaml`}),` — adapter manifests and capabilities.`]}),`
`,(0,n.jsxs)(t.li,{children:[(0,n.jsx)(t.code,{children:`workflows/*.yaml`}),` — workflow profile definitions.`]}),`
`,(0,n.jsxs)(t.li,{children:[(0,n.jsx)(t.code,{children:`skills/index.yaml`}),` — discoverable skill metadata and locations.`]}),`
`,(0,n.jsxs)(t.li,{children:[(0,n.jsx)(t.code,{children:`specs/active/`}),` — current canonical specs.`]}),`
`,(0,n.jsxs)(t.li,{children:[(0,n.jsx)(t.code,{children:`specs/archive/`}),` — superseded or completed specs.`]}),`
`,(0,n.jsxs)(t.li,{children:[(0,n.jsx)(t.code,{children:`missions/`}),`id`,(0,n.jsx)(t.code,{children:`/mission.yaml`}),` — canonical mission packet.`]}),`
`,(0,n.jsxs)(t.li,{children:[(0,n.jsx)(t.code,{children:`missions/`}),`id`,(0,n.jsx)(t.code,{children:`/prompt.md`}),` — runtime-specific prompt generated from mission.`]}),`
`,(0,n.jsxs)(t.li,{children:[(0,n.jsx)(t.code,{children:`missions/`}),`id`,(0,n.jsx)(t.code,{children:`/runtime-session.yaml`}),` — runtime IDs/status/capabilities.`]}),`
`,(0,n.jsxs)(t.li,{children:[(0,n.jsx)(t.code,{children:`missions/`}),`id`,(0,n.jsx)(t.code,{children:`/events.ndjson`}),` — structured lifecycle events.`]}),`
`,(0,n.jsxs)(t.li,{children:[(0,n.jsx)(t.code,{children:`missions/`}),`id`,(0,n.jsx)(t.code,{children:`/artifacts/`}),` — generated outputs not yet promoted.`]}),`
`,(0,n.jsxs)(t.li,{children:[(0,n.jsx)(t.code,{children:`missions/`}),`id`,(0,n.jsx)(t.code,{children:`/diff.patch`}),` — captured patch for review.`]}),`
`,(0,n.jsxs)(t.li,{children:[(0,n.jsx)(t.code,{children:`missions/`}),`id`,(0,n.jsx)(t.code,{children:`/verification.yaml`}),` — checks and results.`]}),`
`,(0,n.jsxs)(t.li,{children:[(0,n.jsx)(t.code,{children:`missions/`}),`id`,(0,n.jsx)(t.code,{children:`/review.md`}),` — human or review-agent notes.`]}),`
`,(0,n.jsxs)(t.li,{children:[(0,n.jsx)(t.code,{children:`missions/`}),`id`,(0,n.jsx)(t.code,{children:`/promotion.yaml`}),` — promotion decision and applied refs.`]}),`
`,(0,n.jsxs)(t.li,{children:[(0,n.jsx)(t.code,{children:`sandboxes/index.yaml`}),` — active/discarded/promoted sandboxes.`]}),`
`,(0,n.jsxs)(t.li,{children:[(0,n.jsx)(t.code,{children:`audit/events.ndjson`}),` — append-only project-level timeline.`]}),`
`]}),`
`,(0,n.jsx)(t.h2,{id:`design-notes`,children:`Design notes`}),`
`,(0,n.jsxs)(t.ul,{children:[`
`,(0,n.jsxs)(t.li,{children:[(0,n.jsx)(t.code,{children:`.harness/`}),` should be checked into git except large logs or secrets.`]}),`
`,(0,n.jsxs)(t.li,{children:[`Secrets must never be stored in `,(0,n.jsx)(t.code,{children:`.harness/`}),`.`]}),`
`,(0,n.jsx)(t.li,{children:`Generated artifacts remain non-canonical until promoted.`}),`
`,(0,n.jsx)(t.li,{children:`Runtime-specific details belong under mission/session records, not in core specs.`}),`
`]})]})}function s(e={}){let{wrapper:t}=e.components||{};return t?(0,n.jsx)(t,{...e,children:(0,n.jsx)(o,{...e})}):o(e)}export{s as default,r as frontmatter,i as structuredData,a as toc};