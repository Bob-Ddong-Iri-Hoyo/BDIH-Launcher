# Update check testing

The launcher update flow should be tested separately from the normal tag release flow.

## What to test

When `autoCheckUpdates` is enabled, app startup should call the update checker and show a dialog/status when an update is found, unavailable, or failed.

## Practical test options

1. Real prerelease test

Create a Beta TestProduction candidate such as
`1.0.1-beta.1.staging.1` through `.github/workflows/staging.yml`, test it in the
isolated Staging app, and promote it through the two Production approvals only
when a real Production prerelease is required. Then run an older matching app
build with update checks enabled.

This is closest to production, but it creates a GitHub prerelease.

2. Local mock update feed

Run a local static server that serves electron-builder update metadata such as `latest-mac.yml` and a dummy artifact URL. Point the dev app updater config at that server.

This is best for repeatedly testing the dialog without creating GitHub releases.

3. Main-process mock

Add a dev-only switch such as `BDIH_MOCK_UPDATE=available` so `UpdateManager` emits an `available` status without calling GitHub.

This is the fastest way to test the renderer dialog states:

```bash
BDIH_MOCK_UPDATE=available pnpm start
BDIH_MOCK_UPDATE=not-available pnpm start
BDIH_MOCK_UPDATE=error pnpm start
```

## Recommended path

Use the main-process mock for UI/dialog behavior, then use one real prerelease before shipping the first public release.

## Signing-certificate transition tests

Mock feeds and renderer mocks cannot validate Squirrel.Mac code-signature
continuity. When rotating the macOS signing certificate, use real packaged apps
and complete this matrix before activating the replacement identity:

```text
old stable   -> bridge stable   -> new stable
old beta     -> bridge beta     -> new beta
old Nightly  -> bridge Nightly  -> new Nightly
```

The bridge builds must still use the old GitHub signing Secrets. CI checks that
their designated requirement contains the old certificate fingerprint, the
replacement fingerprint, and the channel's bundle identifier. Keep at least
one installed old build and one installed bridge build for every channel until
the transition is complete.

The commands, generated files, Secret rotation order, rollback rules, and
archival locations are documented in [Publishing and macOS signing](publish.md#certificate-renewal).
