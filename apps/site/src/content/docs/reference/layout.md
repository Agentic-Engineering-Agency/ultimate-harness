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
│   ├── harness/               lifecycle, run control, teams, observability (98 modules, 111 with subfolders)
│   │   ├── delivery-observatory/
│   │   ├── validate/drift/    8 drift detectors
│   │   └── workflow/          staged and adversarial-QA workflows (library only)
│   ├── adapters/              one module per runtime + capabilities/ manifests
│   ├── extensions/
│   │   ├── honcho-memory/     optional memory
│   │   └── tool-guard/        in-runtime guard hooks (0.11)
│   └── tui/                   OpenTUI/Solid Mission Control, run by Bun from source
├── tests/                     Vitest suite (flat; 179 test files) + fixtures/
├── acceptance/                live acceptance campaign: registry, missions, fixtures, support shims (0.11)
├── apps/
│   ├── hermes-plugin/         Delivery Observatory dashboard plugin (Python API + esbuild UI)
│   └── site/                  this site (Astro Starlight, Cloudflare) + redirect/ for the old domain
├── docs/                      canonical documentation, mirrored into this site
│   ├── architecture/  runbooks/  workflows/  verification/  product/  research/
│   ├── handbook/              operator handbook (0.11)
│   └── ROADMAP.md  VISION.md  quickstart.md  configuration.md  ...
├── specs/                     active specifications (not under docs/)
├── examples/                  example missions (hello-uh) and session templates (examples/templates)
├── scripts/                   build.mjs, check-doc-links.mjs, npm-dist-tag.mjs, smoke tests (scripts/smoke)
├── bin/                       TUI spike entry
├── .harness/                  UH's own project state (dogfooding): adapters, workflows, skills, project brief
├── .github/workflows/         ci, publish, release-plugin, deploy-site
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
| `ci.yml` | every PR; pushes to `dev` and `main` | typecheck, `docs:check-links`, plugin typecheck, build, tests, plugin tests, publish dry-run; optional live smokes for OpenRouter and Anthropic on push when keys are set |
| `publish.yml` | PRs touching the package, `main`, `v*` tags, releases, manual | pack and publish dry-run; publishes to npm on release or manual dispatch with `publish: true`, to dist-tag `next` for a prerelease version and `latest` otherwise (`scripts/npm-dist-tag.mjs`); a release whose GitHub prerelease flag disagrees with the version publishes nothing |
| `release-plugin.yml` | releases, `plugin-v*` tags, manual | builds and attaches the Hermes plugin bundle; on a release, refuses a mismatched prerelease flag |
| `deploy-site.yml` | PRs and `main`, `apps/site/**`, `docs/**`, `specs/**`, `CHANGELOG.md` | builds this site; deploys a preview to `uh-site-preview` on PRs and production to `uh.agenticeng.app` on `main` |

All jobs run on Blacksmith runners (`blacksmith-4vcpu-ubuntu-2404`); change the label to `ubuntu-24.04` to fall back to GitHub-hosted runners.
