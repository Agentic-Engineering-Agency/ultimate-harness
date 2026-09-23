---
title: This site
description: How the documentation site is built, where content lives and how it deploys to Cloudflare.
---

The site lives in `apps/site/`. It is an [Astro Starlight](https://starlight.astro.build) static build served by Cloudflare Workers static assets at `https://uh.agenticeng.app`.

## Two kinds of pages

| Kind | Where you edit | How it gets here |
|---|---|---|
| **Guides** (Start here, How it works, Reference, Road to 1.0, Contributing) | `apps/site/src/content/docs/**` | Written for the site. |
| **Source documents** | The repository's own `docs/`, `specs/` and `CHANGELOG.md` | `apps/site/scripts/sync-docs.mjs` mirrors them into `src/content/docs/source/` before every `dev` and `build`. The mirror is gitignored. |

The repository Markdown stays the single source of truth. The sync script lifts each file's first `# Heading` into the page title, maps `README.md` to the folder index, and rewrites relative links: a link to another mirrored Markdown file becomes a site route, and a link to anything else (source files, scripts, fixtures) goes to the file on GitHub. Nothing is copied by hand, so the mirror cannot drift the way `apps/docs/content/` did.

## Local development

```sh
cd apps/site
bun install --frozen-lockfile
bun run dev        # sync + astro dev on http://localhost:4321
bun run build      # sync + static build into dist/
bun run preview    # serve dist/ through wrangler, like production
```

Node 22.12 or newer is required by Astro 7. Search is built at build time by Pagefind, so it only works in `build` and `preview`, not in `dev`.

## Deployment

`.github/workflows/deploy-site.yml`:

- **Pull requests** that touch `apps/site/`, `docs/`, `specs/` or `CHANGELOG.md` build the site. A broken link to a sidebar page or a malformed frontmatter fails the build.
- **Pushes to `main`** (and manual dispatch) build, then run `wrangler deploy` in the same job (no artifact hand-off, so deploys do not depend on Actions storage quota) with `apps/site/wrangler.jsonc`: a static-assets-only Worker named `uh-site` with the custom domain `uh.agenticeng.app`.

Prerequisites, done once by an account admin:

1. The `agenticeng.app` zone is on the same Cloudflare account as the `CLOUDFLARE_ACCOUNT_ID` secret.
2. The `CLOUDFLARE_API_TOKEN` secret can edit Workers scripts and routes and DNS on that zone. The existing secrets used by `deploy-docs.yml` work if their token covers the new zone.

Wrangler creates the DNS record and certificate for the custom domain on first deploy.

## Relationship to `apps/docs`

`apps/docs` is the previous site (fumadocs on TanStack Start, deployed by Alchemy to `uh.agenticengineering.lat`). It keeps a hand-copied mirror of `docs/` that has drifted, depends on a beta Nitro build and needed several workarounds for Bun crashes during deploy. The plan in the [debt register](/release/debt/) is to run both until `uh.agenticeng.app` is live, then point the old domain at the new site with a redirect and delete `apps/docs` and `deploy-docs.yml`.
