# Update check testing

The launcher update flow should be tested separately from the normal tag release flow.

## What to test

When `autoCheckUpdates` is enabled, app startup should call the update checker and show a dialog/status when an update is found, unavailable, or failed.

## Practical test options

1. Real prerelease test

Use a small prerelease tag such as `v1.0.1-beta.1`, publish it through `.github/workflows/release.yml`, then run an older local app build with update checks enabled.

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
