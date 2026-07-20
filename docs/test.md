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
| Bundle ID | `day.faby.bdih-launcher.update-test` |
| Finder app | `tests/Release/apps/stable-beta/BDIH Launcher Update Test.app` |
| App data | `tests/Release/state/stable-beta/data` |
| Settings | `tests/Release/state/stable-beta/settings/settings.json` |
| Electron state | `tests/Release/state/stable-beta/electron` |
| Build output | `tests/Release/builds/<channel>/<version>` |
| Local feed | `tests/Release/feed` |
| Feed URL | `http://127.0.0.1:45678/` |

Nightly uses an additional isolated identity:

| Resource | Nightly update test value |
| --- | --- |
| Product name | `BDIH Launcher Nightly Update Test` |
| Bundle ID | `day.faby.bdih-launcher.nightly.update-test` |
| Finder app | `tests/Release/apps/nightly/BDIH Launcher Nightly Update Test.app` |
| App data | `tests/Release/state/nightly/data` |
| Settings | `tests/Release/state/nightly/settings/settings.json` |
| Electron state | `tests/Release/state/nightly/electron` |

The test package contains a channel-specific marker (`bdih-update-test.json` or
`bdih-nightly-update-test.json`). Main-process path resolution uses this marker
and the packaged app's location to find its `tests/Release` ancestor. A test app
copied outside `tests/Release` fails closed instead of falling back to
production or home-directory data. It also rejects data paths outside the
selected update-test state root and does not initialize Discord Rich Presence.

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

To generate a sequence of artifacts, pass an inclusive range with `~` (or
`..`). The app source is compiled once and electron-builder packages each
version in order:

```bash
pnpm run build:test:stable -- --range 1.0.0~1.0.9
pnpm run build:test:beta -- --range 1.1.0-beta.1~1.1.0-beta.9
```

Stable, Beta, and Nightly ranges can also be combined in one command. Each
channel takes its own version expression so prerelease names remain explicit:

```bash
pnpm run build:test -- \
  --stable 1.0.0~1.0.9 \
  --beta 1.1.0-beta.1~1.1.0-beta.9
```

Ranges can be descending when the final feed target should exercise a
downgrade. Use `--dry-run` to validate and print the complete plan without
compiling or packaging:

```bash
pnpm run build:test -- --stable 1.0.9~1.0.0 --dry-run
```

After a range has been packaged, switch a channel's local feed metadata to any
existing version without rebuilding it:

```bash
pnpm update:test:select -- --channel stable --version 1.0.4
pnpm update:test:select -- --channel beta --version 1.1.0-beta.4
```

This also updates that channel's last-build record, so `pnpm install:test`
installs the selected Stable/Beta app. A complete range workflow can therefore
install the oldest build and then point the feed at the newest build:

```bash
pnpm run build:test:stable -- --range 1.0.0~1.0.9
pnpm update:test:select -- --channel stable --version 1.0.0
pnpm install:test
pnpm update:test:select -- --channel stable --version 1.0.9
```

Stable versions must not contain a prerelease suffix. Beta and Nightly versions
must use matching `beta` and `nightly` SemVer prerelease identifiers.

Each build is retained below `tests/Release/builds`. Its ZIP, blockmap, and macOS
channel metadata are copied to `tests/Release/feed`, while metadata for other
channels remains available. Per-channel and per-storage-profile build records
below `tests/Release` ensure that a Nightly build cannot accidentally be
installed by the shared Stable/Beta command.

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
isolated Finder location without opening it:

```bash
pnpm install:test
pnpm reveal:test
```

For Nightly:

```bash
pnpm install:test:nightly
pnpm reveal:test:nightly
```

`install:test` installs the most recently built Stable or Beta package;
`install:test:nightly` installs the most recently built Nightly package. Each
command replaces only the matching app below `tests/Release/apps`. The
`reveal:test` commands select that fixed app in Finder. Open only this fixed app
for manual update testing; do not open a target version from
`tests/Release/builds`, because that bypasses the updater.

To open the already-installed test app from Terminal without replacing it:

```bash
pnpm start:test
```

This distinction matters after building the target update. Running with
`install:test` at that point would bypass the updater by directly copying the
new app over the installed old version.

## Start the local update feed

```bash
pnpm update:test:serve
```

The default port is `45678`. To use another port, apply the same value while
building and serving. The selected port is stored with the build, so the
Terminal start command checks that same port:

```bash
BDIH_UPDATE_TEST_PORT=45679 pnpm run build:test -- --version 1.0.0 --channel stable
pnpm update:test:serve -- --port 45679
pnpm start:test
```

Opening `http://127.0.0.1:45678/` shows the files currently available to the
updater.

## Automatic startup update test

The **Automatic updates** option is different from the manual **Check updates**
button. When enabled and saved, opening the installed test app checks the feed
immediately. If a newer version exists, the launcher skips the Later/Update
confirmation, opens a blocking update dialog over the main view, stops
launcher-owned apps and Bottles, downloads the package, installs it, and
relaunches automatically.

1. Install and open the initial test version while its feed is still current.
2. Enable **Automatic updates** in App information and save preferences.
3. Quit the app, then build the newer target version so the feed points to it.
4. Reopen the same installed Finder app without running `install:test` again.
5. Verify that no confirmation dialog appears and the main-view update dialog
   progresses through process checking, state saving, process stopping,
   downloading, and installation handoff.
6. Verify that the app relaunches at the target version and a subsequent startup
   remains open with the **Up to date** status instead of restarting again.

Disable **Automatic updates** and save before exercising the manual confirmation
flow below.

## Manual Stable to Beta test

1. Build Stable `1.0.0`.
2. Start `pnpm update:test:serve` in a separate terminal and keep it running.
3. Run `pnpm install:test`, then open the fixed app selected by `pnpm reveal:test` in Finder.
4. Quit the test app.
5. Build Beta `1.1.0-beta.1`.
6. Reopen the same fixed app in Finder. Do not run `install:test` again.
7. Select the Beta channel in App information.
8. Check for updates. When the confirmation dialog appears, click **Update**. The launcher now checks and closes running apps and Bottles while showing download and installation progress in a blocking dialog over the main view.
9. Confirm that the app relaunches with the updated version. Use **Later** when verifying that dismissing the confirmation leaves the installed app unchanged.

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
2. Start the local update feed and keep it running.
3. Run `pnpm install:test:nightly`, then `pnpm reveal:test:nightly` and open the selected app in Finder.
4. Quit that initial app, then build the next Nightly version.
5. Reopen the same fixed app in Finder without installing the new build.
6. Check for updates, click **Update** in the confirmation dialog, and verify the process-closing and download progress stages in the main-view update dialog before the Nightly-to-Nightly transition completes.

```bash
pnpm run build:test:nightly -- --version 1.2.0-nightly.1
pnpm update:test:serve
pnpm install:test:nightly
pnpm reveal:test:nightly

pnpm run build:test:nightly -- --version 1.2.0-nightly.2
# Reopen tests/Release/apps/nightly/BDIH Launcher Nightly Update Test.app in Finder.
```

To test a Nightly downgrade, build the older Nightly version last so
`nightly-mac.yml` points to it. The Nightly app remains isolated even when the
Stable/Beta test app is installed at the same time.

Do not manually reopen the Finder app while an update is being applied. The
confirmation dialog's **Update** button hands process cleanup, download,
replacement, and relaunch to the launcher and Squirrel so the old process cannot
race the installer.

## Expected limitations

- Local test builds receive a stable ad-hoc designated requirement so Squirrel
  can compare consecutive local versions. The re-sign step preserves Electron's
  JIT entitlements. Public distribution still requires a real Developer ID
  signature and notarization.
- Native Squirrel/macOS may leave bundle-ID-specific ShipIt, preference, HTTP,
  and temporary records in macOS-managed locations. App-owned settings, data,
  logs, Chromium state, and JavaScript updater cache stay below `tests/Release`.
- Local feed testing validates discovery, download, channel selection, and
  downgrade policy, but not GitHub permissions or Release asset naming.
- Perform one final smoke test in a separate GitHub test repository before
  enabling a production channel.
- SnapshotManager rollback behavior requires separate fixture Prefixes and must
  never use production Bottle data.

## Cleanup

Remove the repository-owned test resources:

```bash
rm -rf tests/Release
```

Old test builds created before this layout may still have legacy data below
`~/Applications`, `~/Library/Application Support`, and `~/.bdih-launcher-*`.
They are ignored by new test builds and can be removed separately after
confirming no old test session is needed.
