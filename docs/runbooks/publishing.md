# Publishing Ultimate Harness

Ultimate Harness publishes to the npm registry as `@agenticengineeringagency/ultimate-harness` and exposes the `uh` binary.

## Install smoke

```sh
bun add -g @agenticengineeringagency/ultimate-harness
uh --help
```

A release candidate installs from the `next` dist-tag instead, for example `bun add -g @agenticengineeringagency/ultimate-harness@next` or `@0.11.0-rc.1`.

## Local preflight

```sh
bun install --frozen-lockfile
bun run typecheck
bun run build
bun run test
python -m pip install -r apps/hermes-plugin/dashboard/requirements-dev.txt
bun run plugin:typecheck
bun run plugin:test
bun run publish:dry-run
```

`bun run publish:dry-run` wraps `bun publish --dry-run --tag <dist-tag>` (see [Dist-tags and prereleases](#dist-tags-and-prereleases)) so the package tarball contents and publish metadata are checked without writing to the registry. Bun 1.3.x still expects an npm token-shaped value for scoped-package dry-runs; CI supplies a dummy `NPM_CONFIG_TOKEN` for the dry-run job, while the real publish job uses the repository secret.

## CI/CD

`.github/workflows/publish.yml` has two jobs:

| Job | Trigger | Behavior |
|---|---|---|
| `dry-run` | PRs to `dev`/`main`, pushes, releases, manual dispatch | installs, builds, runs package metadata tests, then runs `bun run publish:dry-run` |
| `publish` | `v*` tag, GitHub release, or manual dispatch with `publish=true` | rebuilds, resolves the dist-tag, and runs `npm publish --access public --tag <dist-tag>` after an idempotency check |

The publish job requires a repository secret named `NPM_CONFIG_TOKEN`. Bun respects this env var for automated registry auth.

`.github/workflows/release-plugin.yml` builds the Hermes plugin tarballs on a `plugin-v*` tag or a published GitHub release and attaches them to the release. It publishes nothing to npm.

## Dist-tags and prereleases

The npm dist-tag comes from the version in `package.json`, through `scripts/npm-dist-tag.mjs`:

| Version | Dist-tag | Example |
|---|---|---|
| SemVer prerelease (has a `-` suffix) | `next` | `0.11.0-rc.1` |
| Release | `latest` | `0.11.0` |

The publish job and `bun run publish:dry-run` both use it, so the dry-run prints the tag a real publish would use (`Tag: next` for a release candidate). A prerelease is never published to `latest`, so `bun add -g @agenticengineeringagency/ultimate-harness` keeps installing the last release.

On a GitHub release event, both workflows also compare the release's pre-release flag with the version and fail before building or publishing when they disagree. That keeps a release candidate off `latest` on npm and keeps its plugin tarball off the stable `releases/latest/download/hermes-plugin.tar.gz` link, which GitHub resolves only to releases not marked as pre-releases.

To cut a release candidate:

1. Set the same version, for example `0.11.0-rc.1`, in `package.json`, `apps/hermes-plugin/plugin.yaml`, `apps/hermes-plugin/dashboard/manifest.json`, `ACP_CLIENT_VERSION` in `src/adapters/acp.ts` and `VERSION` in `src/harness/otel-export.ts`. `tests/package-publish.test.ts` fails while they differ.
2. Date the version's `CHANGELOG.md` heading and run the local preflight above. Check that the dry-run ends with `Tag: next` and `@<version> (dry-run)`.
3. After the release PR merges, push the tag `v<version>`, or publish a GitHub release for it with **Set as a pre-release** checked. Either trigger publishes; a second run for the same version skips through the idempotency check.
4. Promote by publishing the final version (`0.11.0`), which goes to `latest`. Moving `latest` by hand (`npm dist-tag add`) is not part of this flow.

## GitHub secret

Create an npm automation token with publish rights for the `@agenticengineeringagency` scope, then set:

```sh
gh secret set NPM_CONFIG_TOKEN --repo Agentic-Engineering-Agency/ultimate-harness
```

Do not commit npm tokens into the repository. Do not publish from a local shell unless a maintainer explicitly asks for that release path.
