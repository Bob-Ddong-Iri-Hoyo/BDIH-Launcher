# Wine process telemetry and HoYoPlay update replay

Status: the source prototype has passed a local BDIH-to-Wine 11.11 integration
test and is now maintained as one common Wine patch for WineHQ 11.0, WineHQ
11.11, and CrossOver 26.1.0. Clean rebuilding and packaged-runtime integration
tests remain. Existing Prefix/Wineserver observation remains the fallback for
runtimes that do not emit telemetry.

## Why this exists

BDIH currently combines several signals when it follows a Windows application:

- the process initially started by BDIH;
- executable-name and open-file discovery;
- the lifetime of the Wine Prefix and Wineserver;
- Provider-specific Overseer events.

This is sufficient for many launches, but a launcher self-update can replace
the entire process chain. For example, HoYoPlay can transition through:

```text
HYP.exe
  -> HYUpdater.exe
  -> updated HYP.exe
```

The new HYP process does not need to remain a host-level descendant of the
process originally started by BDIH. Prefix lifetime is a safe fallback for the
Bottle's running state, but it does not provide a deterministic process
timeline.

Because BDIH already builds its own Wine runtimes, Wine's server process table
is now used as the source of truth for the prototype. This avoids guessing
lifetime from host parent PIDs or `wineserver -w`.

## Implemented boundary

Wine reports facts. BDIH assigns application meaning.

```text
Wine server/process.c
  -> prefix-scoped FIFO
  -> WineProcessMonitor
  -> BottleExecutionManager PrefixSession
  -> Steam registration and renderer running state
```

Wine must not recognize Steam, HoYoPlay, an updater, or a game. It only reports
process facts. BDIH currently recognizes a Steam game from the reported
`SteamAppId`; additional Profile and Strategy classification remains future
work.

Profiles may classify executable identities such as:

- `primary`: the user-facing launcher or application;
- `handoff`: an updater or bootstrapper allowed to replace the primary;
- `helper`: a non-user-facing subprocess;
- `game`: a launched game process.

Strategies may describe valid transitions, but must not gain direct access to
Wine internals. A HoYoPlay Strategy can therefore describe
`primary -> handoff -> primary` without starting or killing those processes
itself.

## Prototype transport

BDIH creates one native FIFO for a Prefix before Wine starts:

```text
<prefix>/.cache/bdih-process-monitor/process-events.fifo
```

It passes the native path through:

```text
WINE_BDIH_PROCESS_TELEMETRY=1
WINE_BDIH_PROCESS_PIPE=/absolute/path/to/process-events.fifo
```

The Wine server opens the FIFO with `O_WRONLY | O_NONBLOCK` for each event. A
missing reader, a full pipe, or any write error drops that event and never
blocks or fails Windows process creation.

The BDIH side keeps the FIFO open with `O_RDWR | O_NONBLOCK` and attaches it to
Node's event loop. Readable events consume JSON Lines without interval polling,
validate the protocol and event shape, and maintain the current process map. A
changed Wine server PID resets a stale process map left from a previous server
instance.

Command lines are available to the in-process classifier but must not be
written to normal application logs because they can contain tokens or user
data.

The current protocol schema is `bdih.wine.process.v1`.

Example:

```json
{
  "schema": "bdih.wine.process.v1",
  "type": "start",
  "serverPid": 82400,
  "sequence": 14,
  "winePid": 1076,
  "parentWinePid": 304,
  "unixPid": 82411,
  "isSystem": false,
  "startTimeTicks": "134132797234567890",
  "imagePath": "C:\\Program Files\\HoYoPlay\\1.17.0.376\\HYP.exe",
  "commandLine": "\"HYP.exe\" --update --deeplink={}",
  "workingDirectory": "C:\\Program Files\\HoYoPlay",
  "steamAppId": null
}
```

## Event model

The source prototype emits:

- `server_start` after the Wine server finishes initialization;
- `start` when Wine finishes process initialization;
- `system` when Wine marks a process as a system process;
- `exit` when its final thread exits;
- `server_stop` immediately before the Wine server exits normally.

Every event contains the Wine server PID and a server-local monotonic sequence.
Process events additionally contain the Wine PID, parent Wine PID, Unix PID,
system-process state, image path, command line, working directory, and
`SteamAppId`/`SteamGameId` when supplied by the Windows process environment.
Process exit events additionally contain the exit code.

BDIH treats the process map as authoritative only after receiving the first
valid event. Zero non-system processes means that applications are currently
idle; it does not end the Prefix session. The Prefix session ends only after a
`server_stop` event or the `wineserver -w` safety observer confirms that the
server actually exited. This keeps launcher/updater handoffs inside one stable
Prefix session.

The monitor's displayed `activeProcessCount` includes every currently tracked
Wine process object, including system processes and helpers. It becomes zero
only after an `exit` event has removed every tracked process. This is not an
installer-specific condition. It can occur:

- after an ordinary application exits while Wineserver is still within its
  shutdown grace period;
- in a launcher, installer, or updater handoff gap before the replacement
  process starts;
- during an explicit Prefix shutdown, immediately before `server_stop`.

Consequently, neither a Prefix session nor a HoYoPlay route may use process
count zero as its completion signal. HoYoPlay proxy lifetime is tied to the
exact routed target executable: BDIH first observes that executable start, then
terminates the matching proxy only after every matching target Wine PID exits.

Window creation and foreground activation are a separate capability. They
should not be mixed into the first process telemetry protocol. The existing
macOS window focus observer remains responsible for bringing a late window to
the foreground.

## Wine insertion point

Prefer the Wine server/process lifecycle layer because it observes all
processes in a Prefix and their final termination. A `kernelbase` CreateProcess
hook only sees successful creation attempts made through that specific path and
cannot be the sole source of exit events.

The existing HoYo routing pipe remains application-specific and must not become
the general telemetry protocol.

## Capability and fallback

The runtime metadata advertises:

```json
{
  "capabilities": {
    "bdihProcessTelemetry": {
      "protocol": 1,
      "transport": "fifo",
      "activationEnvironment": "WINE_BDIH_PROCESS_TELEMETRY",
      "pipeEnvironment": "WINE_BDIH_PROCESS_PIPE"
    }
  }
}
```

The WineHQ 11.0, WineHQ 11.11, and CrossOver 26.1.0 metadata now advertise this
capability. BDIH exports the private activation flag and FIFO path only when
the selected runtime declares the exact protocol and transport contract. This
capability is deliberately not part of the user-editable launch-option groups.
Older or external Wine runtimes keep their existing observer behavior.

## Completed prototype work

- Added typed event parsing, validation, FIFO ownership and cleanup in
  `WineProcessMonitor`.
- Instrumented Wine 11.11's server process lifecycle.
- Converted the reviewed server delta into
  `wine-build/patches/common/0001-server-bdih-process-telemetry.patch`.
- Added the common patch to WineHQ 11.0, WineHQ 11.11, and CrossOver 26.1.0
  patch pipelines and verified it against all three clean source archives.
- Connected application state to the live process map and Prefix lifetime to
  Wine server lifecycle events.
- Connected process `SteamAppId` to Steam game registration and running state.
- Kept Steam log observation and Wineserver observation as fallbacks.
- Moved the HoYoPlay proxy source to
  `wine-build/BDIH-HelperProgram/hoyoplay-proxy`.
- Connected the existing WineHQ 11.0/11.11 `build-all.sh` pipelines to build
  the proxy, package it at `share/bdhi/helpers/hoyoplay-proxy.exe`, and
  advertise its internal capability. BDIH now resolves the packaged helper
  automatically instead of requiring the local proxy test environment.
- Validated the local WineHQ 11.11 event stream from `server_start` through
  process `start`/`system`/`exit` and `server_stop`.
- Validated a real BDIH HoYoPlay-to-Genshin route: BDIH correlated the launcher
  proxy with `GenshinImpact.exe`, kept it alive while the game ran, and stopped
  only that proxy after the exact game process exited.
- Validated duplicate HoYoPlay game routing against the real launcher and game
  Prefixes. A second route for the same Bottle/game was rejected, only its new
  proxy was terminated, and the already-running game and original proxy were
  left intact.
- Validated the cached HoYoPlay `1.16.1.364` installer. BDIH followed the
  installer exit into the newly installed launcher and then observed
  `launcher.exe -> 1.16.1.364/HYP.exe -> HYPHelper.exe` without ending the
  Prefix session.
- Validated the real Steam installer and client bootstrap. BDIH retained one
  Prefix session through `SteamSetup.exe -> steam.exe`, two Steam client
  self-update restarts, and the final `steamwebhelper.exe` process tree.
- Validated Steam game recovery from Wine telemetry with AppID `500`. Starting
  Left 4 Dead restored a previously removed `steam:500` Bottle app, marked it
  running, and BDIH's stop action terminated only the game process tree while
  leaving Steam running.
- Added a ten-second telemetry startup window before enabling the legacy
  `wineserver -w` fallback. This prevents a cold cloned runtime from being
  reported as finished before its Wine server has emitted `server_start`.

## Work remaining after patch integration

- Clean-rebuild and package WineHQ 11.0, WineHQ 11.11, and CrossOver 26.1.0,
  then repeat the integration test against packaged artifacts rather than an
  injected local Wineserver build.
- Click the real HoYoPlay self-update action and verify the remaining
  `HYP.exe -> HYUpdater.exe -> updated HYP.exe` portion from the recorded event
  stream. Installer-to-old-launcher and old-launcher startup are already
  verified.
- Add a high-volume helper-process test to verify that telemetry cannot stall
  Wine.
- Expose a sanitized diagnostic timeline without exposing full command lines.
- Add process-role descriptors to Profiles.
- Add allowed handoff descriptors to Strategies.
- Add the degraded-stream recovery policy.

## Repeatable HoYoPlay self-update testing

Two different tests are required. They must not be confused.

### Deterministic handoff fixture

Build small test-only Windows executables that reproduce the lifecycle without
contacting HoYo servers:

```text
HYP.exe fixture
  -> starts HYUpdater.exe fixture
  -> exits

HYUpdater.exe fixture
  -> waits briefly
  -> starts a second HYP.exe fixture with --update
  -> exits
```

This test is repeatable in CI and verifies:

- no false `PROCESS_EXIT` between handoff stages;
- updater recognition;
- the new primary process is adopted;
- Prefix cleanup happens only after all Wine processes exit;
- telemetry order and parent relationships.

It does not verify the real HoYoPlay updater, network download, extraction, or
CEF rendering.

### Real updater replay from a frozen Prefix

Keep a local, untracked seed Prefix containing the version immediately before
an available update. Never commit or publish HoYoPlay binaries.

Suggested local layout:

```text
tmp_test_resource/fixtures/hoyoplay-update/
  1.16.1.364/
    seed-prefix/
    runs/

tmp_test_resource/Bottles/hoyoplay-update-replay/
  hoyo-prefix/             # active clone used by one dedicated test Bottle
```

Preparation:

1. Create one dedicated `HoYoUpdateReplay` Bottle.
2. Install the cached HoYoPlay installer into its HoYo Prefix.
3. Confirm that it installed the required old version.
4. Close HoYoPlay and wait for Wineserver to exit.
5. Remove volatile logs, Overseer FIFOs, and lock files.
6. Copy the inactive HoYo Prefix to `seed-prefix`.
7. Keep the Bottle metadata in place; only its HoYo Prefix is reset between
   runs, which avoids duplicate Bottle and app IDs.

For every replay:

1. Stop all Wine processes for the dedicated Bottle and close BDIH.
2. Delete its previous active HoYo Prefix.
3. Create a copy-on-write clone of `seed-prefix` at the Bottle's normal
   `hoyo-prefix` path.
4. Start BDIH and HoYoPlay through the normal supervised Strategy.
5. Click the real update button.
6. Capture the process timeline and application log.
7. Verify the new version and the updated HYP window.
8. Stop Wine before resetting the Prefix for another run.

On APFS, a local clone can be made quickly with:

```bash
cp -cR seed-prefix runs/run-$(date +%Y%m%d-%H%M%S)
```

Use `rsync -a` as a slower fallback when clonefile is unavailable.

The seed Prefix is valid only while HoYo still serves an update from its
contained version. Keep the installer and seed private and record their SHA-256
hashes in a local metadata file.

### Recovering the current test case

The Yuki Prefix has already updated to `1.17.0.376`, so it cannot show the same
update prompt again by itself. The repository's ignored local test data
currently contains this cached installer:

```text
tmp_test_resource/Bottles/yuki/hoyo-prefix/_bdih_installers/HoYoPlaySetup.exe
PE product/file version: 1.16.1.364
SHA-256: 358872def101dbc6590cfe0a1f1924cc1fb8d7b1e5af6beb1b70b34a29479ebd
```

Use it to create a new disposable Prefix. Verify that the installed HYP is
still `1.16.1.364`, close it without accepting the update, and freeze that
Prefix as the seed. If the installer unexpectedly obtains the current payload
from the network, the old installed Prefix must instead be recovered from a
private backup or another pre-update machine.

- Keep the installer and seed Prefix outside Git.
- Do not modify version files or rename directories to simulate a downgrade.
  HoYoPlay's updater state, hashes, registry values, and executable set must
  agree, so a fabricated version is not a valid real-update test.

## Real-update acceptance criteria

- BDIH remains `running` from the first HYP process through the updated HYP
  process.
- `HYUpdater.exe` is observed between the two HYP processes.
- No game routing is triggered by game IDs embedded in updater JSON.
- `--in-process-gpu` is applied only to the top-level HYP process.
- Helper tools such as `7z.exe` receive no launcher-only arguments.
- The updated HYP window appears and is raised when it becomes available.
- Stopping the Bottle or quitting BDIH leaves no Wine process behind.
- The replay clone can be deleted and recreated without changing the seed.
