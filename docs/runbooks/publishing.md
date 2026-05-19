# Publishing Ultimate Harness

Ultimate Harness publishes to the npm registry as `@agenticengineeringagency/ultimate-harness` and exposes the `uh` binary.

## Install smoke

```sh
bun add -g @agenticengineeringagency/ultimate-harness
uh --help
```

## Local preflight

```sh
bun install --frozen-lockfile
bun run typecheck
bun run build
bun run test
bun run publish:dry-run
```

`bun run publish:dry-run` wraps `bun publish --dry-run` so the package tarball contents and publish metadata are checked without writing to the registry. Bun 1.3.x still expects an npm token-shaped value for scoped-package dry-runs; CI supplies a dummy `NPM_CONFIG_TOKEN` for the dry-run job, while the real publish job uses the repository secret.

## CI/CD

`.github/workflows/publish.yml` has two jobs:

| Job | Trigger | Behavior |
|---|---|---|
| `dry-run` | PRs to `dev`/`main`, pushes, releases, manual dispatch | installs, builds, runs package metadata tests, then runs `bun run publish:dry-run` |
| `publish` | push to `main`, `v*` tag, GitHub release, or manual dispatch with `publish=true` | rebuilds and runs `bun publish --access public --tolerate-republish` |

The publish job requires a repository secret named `NPM_CONFIG_TOKEN`. Bun respects this env var for automated registry auth.

## GitHub secret

Create an npm automation token with publish rights for the `@agenticengineeringagency` scope, then set:

```sh
gh secret set NPM_CONFIG_TOKEN --repo Agentic-Engineering-Agency/ultimate-harness
```

Do not commit npm tokens into the repository.
