# BDIH Launcher update test build

This document describes the isolated packaged app used to manually test Stable,
Beta, and Nightly update behavior without reading or modifying production BDIH
Launcher data.

## Safety boundary

The update test package is not the production application with a different
window title. It has its own identity and storage:

| Resource | Update test value |
| --- | --- |
| Product name | `BDIH Launcher Update Test` |
| Bundle ID | `com.fabyday.bdih-launcher.update-test` |
| Installed app | `~/Applications/BDIH Launcher Update Test.app` |
| App data | `~/Library/Application Support/BDIH Launcher Update Test` |
| Settings | `~/.bdih-launcher-update-test/settings.json` |
| Build output | `tests/Release/builds/<channel>/<version>` |
| Local feed | `tests/Release/feed` |
| Feed URL | `http://127.0.0.1:45678/` |

Nightly uses an additional isolated identity:

| Resource | Nightly update test value |
| --- | --- |
| Product name | `BDIH Launcher Nightly Update Test` |
| Bundle ID | `com.fabyday.bdih-launcher.nightly.update-test` |
| Installed app | `~/Applications/BDIH Launcher Nightly Update Test.app` |
| App data | `~/Library/Application Support/BDIH Launcher Nightly Update Test` |
| Settings | `~/.bdih-launcher-nightly-update-test/settings.json` |

The test package contains `bdih-update-test.json`. Main-process path resolution
uses this marker to ignore production path overrides and rejects data paths
outside the update-test app data root. It also does not initialize Discord Rich
Presence.

Do not copy a production settings file into the test settings directory. The
test build intentionally rejects production Bottle, Wine, and DXMT paths.

## Build a test version

Build a Stable package:

```bash
pnpm run build:test -- --version 1.0.0 --channel stable
```

Build a Beta package:

```bash
pnpm run build:test -- --version 1.1.0-beta.1 --channel beta
```

Build a Nightly package:

```bash
pnpm run build:test:nightly -- --version 1.2.0-nightly.1
```

Convenience commands are also available for the shared Stable/Beta test app:

```bash
pnpm run build:test:stable -- --version 1.0.0
pnpm run build:test:beta -- --version 1.1.0-beta.1
```

Stable versions must not contain a prerelease suffix. Beta and Nightly versions
must use matching `beta` and `nightly` SemVer prerelease identifiers.

Each build is retained below `tests/Release/builds`. Its ZIP, blockmap, and macOS
channel metadata are copied to `tests/Release/feed`, while metadata for other
channels remains available. `tests/Release/last-build.json` records the most
recent build for manual installation.

## Install the initial version

Start the local feed in a separate terminal before opening any update test app:

```bash
pnpm update:test:serve
```

Keep that terminal running for the entire manual test. `start:test` and
`start:test:nightly` check the feed before opening the app and stop with an
actionable message instead of allowing Electron to report
`ERR_CONNECTION_REFUSED`.

After building the version that should be installed first, copy it to the
isolated manual-test location and open it:

```bash
pnpm start:test -- --install
```

`--install` replaces only `~/Applications/BDIH Launcher Update Test.app`. It
does not touch `/Applications/BDIH-Launcher.app` or production user data.

To open the already-installed test app without replacing it:

```bash
pnpm start:test
```

This distinction matters after building the target update. Running with
`--install` at that point would bypass the updater by directly copying the new
app over the installed old version.

## Start the local update feed

```bash
pnpm update:test:serve
```

The default port is `45678`. To use another port, apply the same value while
building and serving:

```bash
BDIH_UPDATE_TEST_PORT=45679 pnpm run build:test -- --version 1.0.0 --channel stable
pnpm update:test:serve -- --port 45679
```

Opening `http://127.0.0.1:45678/` shows the files currently available to the
updater.

## Manual Stable to Beta test

1. Build Stable `1.0.0`.
2. Start `pnpm update:test:serve` in a separate terminal and keep it running.
3. Run `pnpm start:test -- --install`.
4. Quit the test app.
5. Build Beta `1.1.0-beta.1`.
6. Run `pnpm start:test` without `--install`.
7. Select the Beta channel in App information.
8. Check for updates and install the offered Beta version.
9. Confirm the installed version after restart.

## Manual Beta to Stable downgrade test

The Stable build and `latest-mac.yml` from the earlier build remain in the
local feed.

1. Start the installed Beta test app.
2. Select the Stable channel.
3. Confirm that the UI identifies the lower Stable target as a downgrade.
4. Approve the transition.
5. Confirm that the app restarts as Stable `1.0.0`.
6. Confirm that only the update-test settings and app-data directories changed.

## Manual Beta version switching

Build the Beta versions in the order that should become the current Beta feed
target. Building an older Beta last intentionally points `beta-mac.yml` to that
older version and exercises `allowDowngrade`.

```bash
pnpm run build:test -- --version 1.2.0-beta.1 --channel beta
pnpm run build:test -- --version 1.1.0-beta.2 --channel beta
```

The ZIP and blockmap for both versions remain in the local feed. Build
`1.2.0-beta.1` again when the feed should offer an upgrade back to it.

## Manual Nightly update test

Nightly is a separate app and never reuses the Stable/Beta test settings or app
data. Its packaged marker forces the updater to the Nightly channel even if a
different channel value is present in imported settings. App information shows
Nightly as a read-only value instead of rendering a channel Select menu.

1. Build the initial Nightly version.
2. Install and open the isolated Nightly test app.
3. Build the next Nightly version.
4. Keep the local update feed running.
5. Open the installed Nightly app without replacing it.
6. Check for updates and verify the Nightly-to-Nightly transition.

```bash
pnpm run build:test:nightly -- --version 1.2.0-nightly.1
pnpm update:test:serve
pnpm start:test:nightly -- --install

pnpm run build:test:nightly -- --version 1.2.0-nightly.2
pnpm start:test:nightly
```

To test a Nightly downgrade, build the older Nightly version last so
`nightly-mac.yml` points to it. The Nightly app remains isolated even when the
Stable/Beta test app is installed at the same time.

## Expected limitations

- Full macOS app replacement may require a valid signing identity.
- Local feed testing validates discovery, download, channel selection, and
  downgrade policy, but not GitHub permissions or Release asset naming.
- Perform one final smoke test in a separate GitHub test repository before
  enabling a production channel.
- SnapshotManager rollback behavior requires separate fixture Prefixes and must
  never use production Bottle data.

## Cleanup

Remove only the isolated test resources:

```bash
rm -rf "$HOME/Applications/BDIH Launcher Update Test.app"
rm -rf "$HOME/Applications/BDIH Launcher Nightly Update Test.app"
rm -rf "$HOME/Library/Application Support/BDIH Launcher Update Test"
rm -rf "$HOME/Library/Application Support/BDIH Launcher Nightly Update Test"
rm -rf "$HOME/.bdih-launcher-update-test"
rm -rf "$HOME/.bdih-launcher-nightly-update-test"
rm -rf tests/Release
```
