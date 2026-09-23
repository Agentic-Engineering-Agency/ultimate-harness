---
title: Repository layout
description: What lives where in the ultimate-harness repository.
---

```text
ultimate-harness/
├── src/
│   ├── cli.ts                 Commander dispatcher (the `uh` bin, via dist/cli.js)
│   ├── index.ts               small library API
│   ├── schema/                Zod contracts for every persisted artifact (uh.*.v0)
│   ├── harness/               lifecycle, run control, teams, observability (~100 modules on v0.11)
│   │   ├── delivery-observatory/
│   │   ├── validate/drift/    8 drift detectors
│   │   └── workflow/          staged and adversarial-QA workflows (library only)
│   ├── adapters/              one module per runtime + capabilities/ manifests
│   ├── extensions/
│   │   ├── honcho-memory/     optional memory
│   │   └── tool-guard/        in-runtime guard hooks (v0.11)
│   └── tui/                   OpenTUI/Solid Mission Control, run by Bun from source
├── tests/                     Vitest suite (flat; 147 files on v0.11) + fixtures/
├── acceptance/                live acceptance campaign: registry, missions, fixtures, support shims (v0.11)
├── apps/
│   ├── hermes-plugin/         Delivery Observatory dashboard plugin (Python API + esbuild UI)
│   ├── docs/                  previous docs site (fumadocs + TanStack Start, Alchemy) — to retire
│   └── site/                  this site (Astro Starlight, Cloudflare)
├── docs/                      canonical documentation, mirrored into this site
│   ├── architecture/  runbooks/  workflows/  verification/  product/  research/
│   ├── handbook/              operator handbook (v0.11)
│   └── ROADMAP.md  VISION.md  quickstart.md  configuration.md  ...
├── specs/                     active specifications (not under docs/)
├── examples/                  example projects and templates
├── scripts/                   build, smoke tests (scripts/smoke, v0.11), maintenance
├── bin/                       TUI spike entry
├── .harness/                  UH's own project state (dogfooding): adapters, workflows, templates
├── .github/workflows/         ci, publish, release-plugin, deploy-docs, deploy-site
├── .claude/ .commandcode/ .omp/ .hermes/   agent harness configuration
├── AGENTS.md                  rules for every agent (CLAUDE.md imports it)
├── CHANGELOG.md  README.md  PRODUCT.md  DESIGN.md
└── package.json               @agenticengineeringagency/ultimate-harness, bin `uh`
```

## What ships to npm

`package.json` `files`: `dist/`, `src/`, `README.md`, `CHANGELOG.md`, top-level `docs/*.md`, and `docs/{architecture,runbooks,product,workflows,verification}/`. `src/` ships because the TUI runs from TypeScript source under Bun, and the built CLI reads a few files relative to it. `apps/` and `tests/` do not ship.

## Workflows

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | every PR; pushes to `dev` and `main` | typecheck, plugin typecheck, build, tests, plugin tests, publish dry-run; optional live smokes for OpenRouter and Anthropic on push when keys are set |
| `publish.yml` | PRs touching the package, `main`, `v*` tags, releases, manual | pack and publish dry-run; publishes to npm on release or manual dispatch with `publish: true` |
| `release-plugin.yml` | releases | builds and attaches the Hermes plugin bundle |
| `deploy-docs.yml` | `main`, `apps/docs/**` | Alchemy deploy of the old site to `uh.agenticengineering.lat` |
| `deploy-site.yml` | PRs and `main`, `apps/site/**`, `docs/**`, `specs/**`, `CHANGELOG.md` | builds this site; deploys to `uh.agenticeng.app` on `main` |

All jobs run on Blacksmith runners (`blacksmith-4vcpu-ubuntu-2404`); change the label to `ubuntu-24.04` to fall back to GitHub-hosted runners.
