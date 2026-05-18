import{V as e,z as t}from"./index-Cj773Jxy.js";var n=e(t()),r={title:`Core Entities`,description:"A repository or workspace managed by Ultimate Harness. It owns `.harness/` metadata and links to external issue trackers."},i={contents:[{heading:`project`,content:"A repository or workspace managed by Ultimate Harness. It owns `.harness/` metadata and links to external issue trackers."},{heading:`project`,content:`Key fields:`},{heading:`project`,content:"`id`"},{heading:`project`,content:"`name`"},{heading:`project`,content:"`root_path`"},{heading:`project`,content:"`issue_sources`"},{heading:`project`,content:"`default_workflow_profiles`"},{heading:`project`,content:"`artifact_schema_version`"},{heading:`issue-reference`,content:`A link to GitHub, Linear, or another tracker item.`},{heading:`issue-reference`,content:`Key fields:`},{heading:`issue-reference`,content:"`provider`"},{heading:`issue-reference`,content:"`id`"},{heading:`issue-reference`,content:"`url`"},{heading:`issue-reference`,content:"`title`"},{heading:`issue-reference`,content:"`status`"},{heading:`spec`,content:`A durable statement of desired behavior, constraints, and acceptance criteria.`},{heading:`workflow-profile`,content:`A named recipe for turning a request into missions and verification gates.`},{heading:`skill`,content:`A reusable procedural capability with metadata, body, prerequisites, and verification hooks.`},{heading:`mission`,content:`A bounded executable work unit compiled from a request/spec/plan.`},{heading:`mission-packet`,content:`The serialized mission passed to a runtime adapter.`},{heading:`runtime`,content:`The external agent system that executes work.`},{heading:`runtime-adapter`,content:`The code/config that maps Ultimate Harness lifecycle calls to a runtime.`},{heading:`runtime-session`,content:`A single execution attempt inside a runtime, associated with a mission and sandbox.`},{heading:`sandbox`,content:`An isolated workspace where the runtime performs changes.`},{heading:`artifact`,content:`Any output produced or consumed by the harness: docs, specs, plans, prompts, logs, diffs, verification results, review notes, or promoted files.`},{heading:`verification-result`,content:`Structured evidence for checks and reviews.`},{heading:`promotion-record`,content:`A record that approved sandbox artifacts were moved into canonical state.`},{heading:`audit-event`,content:`Append-only trace event connecting decisions, runtime activity, verification, and promotion.`}],headings:[{id:`project`,content:`Project`},{id:`issue-reference`,content:`Issue reference`},{id:`spec`,content:`Spec`},{id:`workflow-profile`,content:`Workflow profile`},{id:`skill`,content:`Skill`},{id:`mission`,content:`Mission`},{id:`mission-packet`,content:`Mission packet`},{id:`runtime`,content:`Runtime`},{id:`runtime-adapter`,content:`Runtime adapter`},{id:`runtime-session`,content:`Runtime session`},{id:`sandbox`,content:`Sandbox`},{id:`artifact`,content:`Artifact`},{id:`verification-result`,content:`Verification result`},{id:`promotion-record`,content:`Promotion record`},{id:`audit-event`,content:`Audit event`}]},a=[{depth:2,url:`#project`,title:(0,n.jsx)(n.Fragment,{children:`Project`})},{depth:2,url:`#issue-reference`,title:(0,n.jsx)(n.Fragment,{children:`Issue reference`})},{depth:2,url:`#spec`,title:(0,n.jsx)(n.Fragment,{children:`Spec`})},{depth:2,url:`#workflow-profile`,title:(0,n.jsx)(n.Fragment,{children:`Workflow profile`})},{depth:2,url:`#skill`,title:(0,n.jsx)(n.Fragment,{children:`Skill`})},{depth:2,url:`#mission`,title:(0,n.jsx)(n.Fragment,{children:`Mission`})},{depth:2,url:`#mission-packet`,title:(0,n.jsx)(n.Fragment,{children:`Mission packet`})},{depth:2,url:`#runtime`,title:(0,n.jsx)(n.Fragment,{children:`Runtime`})},{depth:2,url:`#runtime-adapter`,title:(0,n.jsx)(n.Fragment,{children:`Runtime adapter`})},{depth:2,url:`#runtime-session`,title:(0,n.jsx)(n.Fragment,{children:`Runtime session`})},{depth:2,url:`#sandbox`,title:(0,n.jsx)(n.Fragment,{children:`Sandbox`})},{depth:2,url:`#artifact`,title:(0,n.jsx)(n.Fragment,{children:`Artifact`})},{depth:2,url:`#verification-result`,title:(0,n.jsx)(n.Fragment,{children:`Verification result`})},{depth:2,url:`#promotion-record`,title:(0,n.jsx)(n.Fragment,{children:`Promotion record`})},{depth:2,url:`#audit-event`,title:(0,n.jsx)(n.Fragment,{children:`Audit event`})}];function o(e){let t={code:`code`,h2:`h2`,li:`li`,p:`p`,ul:`ul`,...e.components};return(0,n.jsxs)(n.Fragment,{children:[(0,n.jsx)(t.h2,{id:`project`,children:`Project`}),`
`,(0,n.jsxs)(t.p,{children:[`A repository or workspace managed by Ultimate Harness. It owns `,(0,n.jsx)(t.code,{children:`.harness/`}),` metadata and links to external issue trackers.`]}),`
`,(0,n.jsx)(t.p,{children:`Key fields:`}),`
`,(0,n.jsxs)(t.ul,{children:[`
`,(0,n.jsx)(t.li,{children:(0,n.jsx)(t.code,{children:`id`})}),`
`,(0,n.jsx)(t.li,{children:(0,n.jsx)(t.code,{children:`name`})}),`
`,(0,n.jsx)(t.li,{children:(0,n.jsx)(t.code,{children:`root_path`})}),`
`,(0,n.jsx)(t.li,{children:(0,n.jsx)(t.code,{children:`issue_sources`})}),`
`,(0,n.jsx)(t.li,{children:(0,n.jsx)(t.code,{children:`default_workflow_profiles`})}),`
`,(0,n.jsx)(t.li,{children:(0,n.jsx)(t.code,{children:`artifact_schema_version`})}),`
`]}),`
`,(0,n.jsx)(t.h2,{id:`issue-reference`,children:`Issue reference`}),`
`,(0,n.jsx)(t.p,{children:`A link to GitHub, Linear, or another tracker item.`}),`
`,(0,n.jsx)(t.p,{children:`Key fields:`}),`
`,(0,n.jsxs)(t.ul,{children:[`
`,(0,n.jsx)(t.li,{children:(0,n.jsx)(t.code,{children:`provider`})}),`
`,(0,n.jsx)(t.li,{children:(0,n.jsx)(t.code,{children:`id`})}),`
`,(0,n.jsx)(t.li,{children:(0,n.jsx)(t.code,{children:`url`})}),`
`,(0,n.jsx)(t.li,{children:(0,n.jsx)(t.code,{children:`title`})}),`
`,(0,n.jsx)(t.li,{children:(0,n.jsx)(t.code,{children:`status`})}),`
`]}),`
`,(0,n.jsx)(t.h2,{id:`spec`,children:`Spec`}),`
`,(0,n.jsx)(t.p,{children:`A durable statement of desired behavior, constraints, and acceptance criteria.`}),`
`,(0,n.jsx)(t.h2,{id:`workflow-profile`,children:`Workflow profile`}),`
`,(0,n.jsx)(t.p,{children:`A named recipe for turning a request into missions and verification gates.`}),`
`,(0,n.jsx)(t.h2,{id:`skill`,children:`Skill`}),`
`,(0,n.jsx)(t.p,{children:`A reusable procedural capability with metadata, body, prerequisites, and verification hooks.`}),`
`,(0,n.jsx)(t.h2,{id:`mission`,children:`Mission`}),`
`,(0,n.jsx)(t.p,{children:`A bounded executable work unit compiled from a request/spec/plan.`}),`
`,(0,n.jsx)(t.h2,{id:`mission-packet`,children:`Mission packet`}),`
`,(0,n.jsx)(t.p,{children:`The serialized mission passed to a runtime adapter.`}),`
`,(0,n.jsx)(t.h2,{id:`runtime`,children:`Runtime`}),`
`,(0,n.jsx)(t.p,{children:`The external agent system that executes work.`}),`
`,(0,n.jsx)(t.h2,{id:`runtime-adapter`,children:`Runtime adapter`}),`
`,(0,n.jsx)(t.p,{children:`The code/config that maps Ultimate Harness lifecycle calls to a runtime.`}),`
`,(0,n.jsx)(t.h2,{id:`runtime-session`,children:`Runtime session`}),`
`,(0,n.jsx)(t.p,{children:`A single execution attempt inside a runtime, associated with a mission and sandbox.`}),`
`,(0,n.jsx)(t.h2,{id:`sandbox`,children:`Sandbox`}),`
`,(0,n.jsx)(t.p,{children:`An isolated workspace where the runtime performs changes.`}),`
`,(0,n.jsx)(t.h2,{id:`artifact`,children:`Artifact`}),`
`,(0,n.jsx)(t.p,{children:`Any output produced or consumed by the harness: docs, specs, plans, prompts, logs, diffs, verification results, review notes, or promoted files.`}),`
`,(0,n.jsx)(t.h2,{id:`verification-result`,children:`Verification result`}),`
`,(0,n.jsx)(t.p,{children:`Structured evidence for checks and reviews.`}),`
`,(0,n.jsx)(t.h2,{id:`promotion-record`,children:`Promotion record`}),`
`,(0,n.jsx)(t.p,{children:`A record that approved sandbox artifacts were moved into canonical state.`}),`
`,(0,n.jsx)(t.h2,{id:`audit-event`,children:`Audit event`}),`
`,(0,n.jsx)(t.p,{children:`Append-only trace event connecting decisions, runtime activity, verification, and promotion.`})]})}function s(e={}){let{wrapper:t}=e.components||{};return t?(0,n.jsx)(t,{...e,children:(0,n.jsx)(o,{...e})}):o(e)}export{s as default,r as frontmatter,i as structuredData,a as toc};