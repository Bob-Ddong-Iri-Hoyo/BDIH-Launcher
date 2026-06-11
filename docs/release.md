# Release flow

Releases are tag based. `package.json` is the source of truth for the app version, and the release tag must match it exactly.

## Stable release

```bash
pnpm version 1.2.3 --no-git-tag-version
git add package.json pnpm-lock.yaml
git commit -m "chore: release v1.2.3"
git tag v1.2.3
git push origin main
git push origin v1.2.3
```

The GitHub Action publishes a normal GitHub release and uses the `latest` update channel.

## Prerelease

```bash
pnpm version 1.2.3-beta.1 --no-git-tag-version
git add package.json pnpm-lock.yaml
git commit -m "chore: release v1.2.3-beta.1"
git tag v1.2.3-beta.1
git push origin main
git push origin v1.2.3-beta.1
```

Tags with a prerelease suffix publish as GitHub prereleases. The update channel is the first prerelease segment, so `v1.2.3-beta.1` uses `beta` and `v1.2.3-alpha.1` uses `alpha`.

## Version rule

The workflow intentionally fails when these do not match:

```text
tag:          v1.2.3
package.json: 1.2.3
```

This prevents accidentally publishing a release where the GitHub tag, auto-update metadata, and app version disagree.
