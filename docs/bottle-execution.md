# Bottle execution architecture

This document describes how Bottle execution works today, why the current
design is difficult to extend safely, and the target provider-based execution
architecture.

The target architecture in this document is a design direction. Unless a
section explicitly says otherwise, the interfaces shown below are not yet
implemented.

An initial compatibility layer is implemented for Strategy availability and
launcher installation plans. It evaluates declarative Wine, dependency, and
supervisor requirements before execution and emits typed availability events.
Steam and HoYoPlay installation Strategies now build side-effect-free plans
through a capability-scoped Context. `BottleExecutionManager` executes those
plans while the remaining launch routes continue their staged migration.

Application-owned definitions live below `src/Main/Data`, next to their
Profiles. `Main/Execution` contains only shared contracts, evaluation, event
coordination, and the temporary route resolver.

## Goals

- Keep application-specific execution behavior outside the central execution
  manager.
- Package a runtime Profile, recognition rules, and execution Strategies as one
  provider that can be registered with the launcher.
- Let the execution manager run every provider through the same versioned
  contract without knowing whether the provider is Steam, HoYoPlay, or a game.
- Give Strategies a small, capability-scoped Context instead of direct access
  to managers, Electron IPC, the filesystem, or process spawning.
- Track transient execution state independently from persistent Bottle
  metadata.
- Support renamed or externally supplied executables through explicit provider
  binding, with automatic recognition as a convenience rather than a source of
  truth.
- Preserve cancellation, cleanup, logging, path safety, and metadata ownership
  inside launcher-controlled code.

## Non-goals

- A Strategy is not a general-purpose plugin API with unrestricted Node.js
  access.
- A Profile is not expected to encode arbitrary process orchestration as data.
- File names alone must not determine which privileged execution path is used.
- Progress events and live process IDs must not be persisted as normal Bottle
  metadata.

## Current architecture

### Request flow

Bottle execution currently follows this general path:

```text
Renderer
  -> IPC payload
  -> IPCManager
  -> BottleExecutionManager
  -> Wine/DXMT/Jadeite/process helpers
  -> prefix session events
  -> Renderer Bottle state
  -> BottleManager persistence
```

The Renderer constructs payloads such as `RunBottleExecutablePayload` and
`InstallBottleLauncherPayload`. Several fields describe execution semantics but
are optional:

```ts
interface RunBottleExecutablePayload {
  appId?: string;
  executablePath: string;
  executableArgs?: string[];
  launchOptions?: BottleLaunchOptionsPayload;
  executionMode?: "app" | "installer";
}
```

`BottleExecutionManager` then combines these flags with executable inspection,
Profile lookup, Wine setup, DXMT preparation, process creation, launcher
discovery, prefix session tracking, Discord activity, logs, and Bottle metadata
updates.

### What Profiles already solve

Runtime Profiles moved useful static data out of the execution manager:

- Known executable names.
- Preferred executable discovery paths.
- Bounded fallback scan rules.
- Supported launch-option keys.
- Launcher-specific option definitions.

This is the correct responsibility for a Profile. Profiles describe what an
application and its runtime look like. They should remain data-oriented.

Profiles do not own lifecycle behavior around an executable. Provider
Strategies own the declarative lifecycle policy; the manager executes it and
still owns process, filesystem, IPC, and metadata side effects.

### Current launcher installation flow

The launcher installer dialog exposes two provider-bound sources for Steam and
HoYoPlay. The primary action downloads the official installer and changes from
`Download` to `Install` when the cached download is complete. The secondary
action lets the user select a local Windows EXE. A selected file must be a
readable `.exe` with a PE `MZ` header; after that validation, both sources enter
the same provider-specific installation and session-handoff flow. The generic
direct-execution card is not exposed as an installation entry point.

The dedicated launcher installation path currently performs all of the
following in `BottleExecutionManager`:

1. Resolve or download the launcher installer.
2. Resolve DXMT and, for Steam, prepare a Bottle-local Wine runtime clone before
   the first `wineboot`.
3. Prepare the launcher-specific Wine prefix, including matching x64
   `system32` and x86 `syswow64` DXMT files.
4. Start the Steam installer with the same Bottle-local Wine runtime so Steam
   surviving the installer inherits DXMT immediately. HoYoPlay instead uses its
   base launcher runtime and must enter the supervised HoYoPlay route before a
   game is launched in its game-specific prefix.
5. Create a prefix session.
6. Poll the prefix for the expected launcher executable.
7. Keep polling through a short grace period when the installer exits cleanly;
   stop immediately on failure, or when the grace period or global timeout
   expires.
8. Update launcher task state and optionally force a Bottle metadata refresh.

The active `LauncherInstallExecutionPlan` is built by application-owned
Strategies through `LauncherInstallPlanContext`. Context commands construct
opaque descriptors and perform no filesystem or process work. The plan covers
runtime binding, prefix ownership, completion detection, post-install
transition, and supervisor selection.

Steam declares a process-tree DXMT binding and an `adopt-existing` transition
with the `steam-session` supervisor. HoYoPlay declares base Wine and a
`stop-and-relaunch` transition to `hoyoplay.supervised-launch` with the
`hoyoplay-overseer` supervisor. The HoYoPlay install preflight therefore checks
`wineserver`, the HoYo routing/network manifest groups, and supervisor
registration before the installer starts.

## Original Steam handoff behavior and regression

Steam installation was originally designed to survive the transition from
`SteamSetup.exe` to the Steam bootstrapper and finally `steam.exe`.

Before commit `4d09928`, the installer prefix session was registered as the
launcher session:

```ts
this.startPrefixSession(
  request,
  {
    launcher: request.launcher,
    appId: request.launcher,
    appName: installerLabel,
  },
  sender,
);
```

The executable watcher also continued independently of the installer parent's
exit. When `steam.exe` appeared, the refreshed Steam app could inherit the
already-running prefix session.

Commit `4d09928` changed the session identity to an installer-only app ID and
removed the launcher identity:

```ts
{
  appId: `installer:${request.launcher}`,
  appName,
}
```

The same change passed the installer process completion promise into the
executable watcher. The watcher now returns early when the installer parent
exits before the target executable is detected.

That is a normal Steam sequence:

```text
SteamSetup.exe exits
  -> Steam bootstrap/update processes continue in the prefix
  -> steam.exe is installed or replaced
  -> the real Steam client starts
```

As a result, a clean prefix can run Steam successfully while the launcher has
already stopped installation discovery. The session remains identified as
`installer:steam`, so the detected Steam app cannot inherit it and the UI does
not show Steam as running.

Commit `5cee1ae` later introduced `executionMode: "installer"` for the generic
direct-executable runner. The dedicated launcher installer path was not moved
to that contract, leaving its `launcher` and `executionMode` session fields
undefined.

An existing development Bottle can hide the regression because `steam.exe` is
already present and can be detected before the installer parent exits. A new
Nightly Bottle starts with a clean prefix, so the invalid parent-exit boundary
is much more likely to be observed. The different storage root is not the
cause; the initial filesystem state and event order are different.

### Compatibility handoff now in use

Until launcher installation moves fully into provider-owned Strategies, the
manager preserves one prefix session across the transition:

```text
installer:<launcher> / executionMode=installer
  -> launcher executable becomes stable
  -> same session ID changes to appId=<launcher>
  -> launcher=<launcher> / executionMode=app
  -> UI receives the handoff and marks the launcher as running
```

A clean installer exit receives a 30-second discovery grace period so Steam's
bootstrap/update processes can create or replace `steam.exe`. Steam handoff
also attaches the game-process log watcher to the surviving session.

Steam game discovery reads every accessible library declared in
`steamapps/libraryfolders.vdf`, translating Wine C:, G:, and Z: paths back to
host paths. Conventional `G:\\steamapps` and
`G:\\SteamLibrary\\steamapps` layouts are included as fallbacks. When the
running Steam session reports a previously unknown `steam:<appid>`, the
renderer forces a Bottle metadata rescan so the shared-library game can enter
the app list.

## Problems with the current design

### Optional flags permit invalid states

The current types allow combinations such as:

```ts
{
  appId: "installer:steam",
  launcher: undefined,
  executionMode: undefined,
}
```

Every call site must remember which flags are required for a particular
lifecycle. A missing flag does not necessarily produce a type error and can
silently change process tracking behavior.

### The central manager owns too many responsibilities

`BottleExecutionManager` currently knows about application identity, Wine
runtime resolution, prefix preparation, DXMT composition, launcher-specific
workarounds, process supervision, executable discovery, session handoff,
metadata updates, logs, UI events, and external activity reporting.

Adding a new launcher often requires editing the manager in several unrelated
places. It is also difficult to test one lifecycle without constructing many
of the manager's dependencies.

### Transient and persistent state are coupled

Renderer status events update Bottle state and can enqueue a full Bottle save
for each progress update. Main-process launcher tasks can write the same
registry and prefix metadata independently. Forced metadata reloads may run
while these writes are in progress.

Process IDs, download progress, and temporary installer phases are session
state. They should not share the same write lifecycle as selected runtimes,
installed applications, and launch options.

### Recognition and execution are mixed

The current code sometimes derives execution meaning from an app ID, source,
path, executable name, or request flags. A renamed executable can bypass the
intended route even when the user knows exactly what it is.

Recognition should propose a provider binding. It should not be repeated deep
inside execution code and should not override explicit user intent.

## Target architecture

The target unit of registration is an `ExecutionProvider`. A provider packages
the data and behavior required for one launcher or game family.

```ts
interface ExecutionProvider<P extends RuntimeProfile = RuntimeProfile> {
  manifest: ExecutionProviderManifest;
  profile: P;
  recognizer: ProviderRecognizer;
  strategies: {
    install?: ExecutionStrategy<P, InstallExecutionRequest>;
    launch: ExecutionStrategy<P, LaunchExecutionRequest>;
    repair?: ExecutionStrategy<P, RepairExecutionRequest>;
    uninstall?: ExecutionStrategy<P, UninstallExecutionRequest>;
  };
}
```

The execution manager is a generic coordinator:

```text
ExecutionRequest
  -> ProviderRegistry.resolve(providerId)
  -> select operation Strategy
  -> create launcher-owned session
  -> create capability-scoped Context
  -> Strategy.run(Context, request)
  -> commit terminal result
  -> dispose Context and session resources
```

It does not branch on `steam`, `hoyoplay`, or a game ID.

### Application-owned layout

Each application directory owns its Profile and Strategy definitions and
exports them together as a Provider:

```text
src/Main/Data/
  GenericWine/
    profile.ts
    strategy.ts
    index.ts
  Steam/
    profile.ts
    strategy.ts
    index.ts
  Hoyoverse/
    genshin/
      profile.ts
      strategy.ts
      index.ts
    hoyoplay/
      profile.ts
      strategy.ts
      index.ts
    starrail/
      profile.ts
      strategy.ts
      index.ts
    zenless-zone-zero/
      profile.ts
      strategy.ts
      index.ts
```

`profile.ts` owns declarative application and runtime data. `strategy.ts` owns
the requirements and, after execution migration, the Context-based lifecycle.
`index.ts` is the public application boundary:

```ts
export const GENSHIN_EXECUTION_PROVIDER = {
  profile: GENSHIN_HOYO_GAME_PROFILE,
  strategies: {
    launch: GENSHIN_EXECUTION_STRATEGY,
  },
};
```

Current application Strategies inherit `ExecutionStrategyDefinition`. During
the compatibility stage this base class supplies the availability contract.
It intentionally does not expose a fake `run` method: execution is added only
when that application's real manager-owned route is migrated to Context.

## Explicit execution requests

Execution meaning must be represented by a discriminated request instead of an
optional mode flag.

```ts
type ExecutionRequest =
  | InstallLauncherRequest
  | LaunchAppRequest
  | RunManualInstallerRequest
  | RepairAppRequest;

interface InstallLauncherRequest {
  kind: "install-launcher";
  providerId: string;
  bottleId: string;
  artifact: ExecutableHandle;
  resolution: "explicit" | "saved-binding" | "recognized";
}

interface LaunchAppRequest {
  kind: "launch-app";
  providerId: string;
  bottleId: string;
  appId: string;
}
```

Once a request exists, the Strategy never needs to rediscover whether it is
running as an app or installer. Invalid combinations are rejected at the IPC
boundary.

## Strategy contract

A Strategy orchestrates one operation using a Context created by the launcher.
It does not receive real managers or unrestricted platform APIs.

```ts
interface ExecutionStrategy<
  P extends RuntimeProfile,
  R extends ExecutionRequest,
> {
  availability: ExecutionStrategyAvailabilityPolicy<R>;
  run(
    context: ExecutionContext<P>,
    request: R,
  ): Promise<ExecutionResult>;
}
```

The Strategy can call ergonomic async functions, while the Context validates
and delegates every side effect to the internal execution engine.

```ts
const steamInstallStrategy: ExecutionStrategy<
  SteamLauncherProfile,
  InstallLauncherRequest
> = {
  async run(context) {
    const prefix = await context.prefix.prepareLauncherPrefix();
    const installer = await context.installer.start({
      artifact: context.requestArtifact,
      prefix,
    });
    const steam = await context.launcher.waitForHandoff({
      installer,
      profile: context.profile,
      timeoutMs: 10 * 60 * 1000,
    });

    await context.session.handoff({ from: installer, to: steam });
    return context.result.installed(steam);
  },
};
```

`waitForHandoff` is a semantic operation. Its default contract is that normal
parent process exit does not cancel child-process or prefix discovery. It ends
when the target application is detected, the prefix becomes idle, the session
is cancelled, or the timeout expires.

### Availability preflight

Every Strategy declares what its execution path requires before `run` is
called. Requirements describe capabilities, not Wine build names:

```ts
type ExecutionRequirement =
  | { kind: "wine-runtime"; id: string; label: string }
  | { kind: "wine-tool"; tool: "wine64" | "wineboot" | "wineserver" }
  | { kind: "wine-manifest-group"; groupId: string }
  | { kind: "wine-launch-option"; optionName: string }
  | { kind: "wine-family"; anyOf: string[] }
  | { kind: "runtime-dependency"; dependency: "dxmt" | "jadeite" };
```

The launcher creates an `ExecutionCapabilityProbe` from the selected Wine
runtime and launcher-owned dependency resolvers. The Strategy receives the
result through its availability contract; it does not inspect arbitrary host
paths itself.

```ts
interface ExecutionStrategyAvailabilityPolicy<R> {
  providerId: string;
  strategyId: string;
  operation: "launch" | "install" | "repair" | "uninstall";
  requirements:
    | readonly ExecutionRequirement[]
    | ((request: R) => readonly ExecutionRequirement[]);
  checkAvailability?(context: AvailabilityContext<R>): Promise<AvailabilityIssue[]>;
}
```

Declarative requirements cover common checks. `checkAvailability` exists for a
provider-specific contract that cannot be represented by the shared
vocabulary. It can only add structured issues and does not receive managers or
raw process APIs.

The execution sequence becomes:

```text
Strategy selected
  -> emit checking
  -> probe selected Wine and declared dependencies
  -> evaluate declarative requirements
  -> run optional provider-specific availability check
  -> emit available and continue
     or emit unavailable and stop before side effects
```

The availability event contains the Bottle, app, Provider, Strategy, selected
Wine version, issue codes, diagnostic messages, and remediation text. The
initial compatibility implementation exposes
`bottle:execution-availability-update` with `checking`, `available`, and
`unavailable` states. An unavailable result is also returned to the IPC caller,
so a missed renderer event cannot cause execution to continue.

Currently registered application-owned Strategies cover:

- Generic Wine application launch and installer execution.
- Steam launcher installation, launcher execution, and Steam game execution.
- HoYoPlay installation and supervised execution.
- ZZZ and Genshin execution with Wine manifest groups and DXMT.
- Star Rail execution with Wine manifest groups, DXMT, and Jadeite.

This is deliberately a preflight boundary, not the finished Provider runtime.
`ExecutionStrategyResolver` currently selects the application-owned Provider
Strategy from the legacy manager-derived classification. `ProviderRegistry`
will replace that temporary resolver as each existing execution branch becomes
a real Context-based Strategy.

## Generic Wine provider

Unknown and ordinary Windows programs use a built-in `generic-wine` Provider.
This keeps fallback behavior inside the same Provider contract instead of
adding a special branch to the execution manager.

```ts
const genericWineProvider: ExecutionProvider = {
  manifest: {
    id: "generic-wine",
    capabilities: [
      "prefix.prepare",
      "executable.launch",
      "session.observe",
    ],
  },
  profile: genericWineProfile,
  recognizer: genericWineRecognizer,
  strategies: {
    launch: genericLaunchStrategy,
    install: genericInstallerStrategy,
  },
};
```

`genericLaunchStrategy` performs normal Wine prefix preparation, argument and
environment composition, process startup, and session observation. A known
Provider that needs no special lifecycle can reuse this Strategy.

`genericInstallerStrategy` uses installer session semantics. The bootstrap
parent exiting is not treated as proof that the whole prefix is idle, and a
newly discovered executable is not persisted without an explicit registration
decision.

The generic Strategies must not infer a privileged Provider from a file name,
perform Steam or HoYo handoff behavior, or write Bottle metadata directly.

## Capability-scoped Context

The Context is created per execution session. It is a narrow facade over
launcher-owned services:

```ts
interface ExecutionContext<P extends RuntimeProfile> {
  readonly profile: P;
  readonly signal: AbortSignal;
  readonly requestArtifact?: ExecutableHandle;

  prefix: {
    prepareLauncherPrefix(): Promise<PrefixHandle>;
    waitUntilIdle(prefix: PrefixHandle): Promise<void>;
  };

  installer: {
    start(input: StartInstallerInput): Promise<InstallerHandle>;
  };

  launcher: {
    waitForHandoff(input: WaitForHandoffInput<P>): Promise<AppHandle>;
  };

  session: {
    handoff(input: SessionHandoffInput): Promise<void>;
    report(input: SessionProgressInput): void;
  };

  result: {
    installed(app: AppHandle): ExecutionResult;
    launched(app: AppHandle): ExecutionResult;
  };
}
```

The Context must not expose general-purpose escape hatches:

```ts
// Not part of ExecutionContext.
context.exec(command);
context.process.spawn(command, args);
context.filesystem.write(absolutePath, data);
context.ipc.send(channel, payload);
context.bottleRepository.save(bottle);
```

If a provider needs a new capability, the launcher should add a semantic,
validated operation rather than expose the underlying manager.

### Opaque handles

Context operations exchange opaque handles instead of raw PIDs and unrestricted
host paths:

```ts
type PrefixHandle = OpaqueHandle<"prefix">;
type InstallerHandle = OpaqueHandle<"installer">;
type AppHandle = OpaqueHandle<"app">;
type ExecutableHandle = OpaqueHandle<"executable">;
```

The engine resolves each handle inside the current session and verifies
ownership before acting on it. A Strategy cannot construct a valid handle for a
different Bottle or session.

### Context factory

```ts
class ExecutionManager {
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const provider = this.providers.resolve(request.providerId);
    const strategy = resolveStrategy(provider, request.kind);
    const session = this.sessions.create(request);
    const context = this.contexts.create({
      session,
      profile: provider.profile,
      capabilities: provider.manifest.capabilities,
    });

    try {
      const result = await strategy.run(context, request);
      await this.results.commit(request, result);
      return result;
    } finally {
      await context.dispose();
    }
  }
}
```

The manager owns cancellation, cleanup, terminal result persistence, and
provider capability enforcement. The Strategy owns application-specific
ordering through the Context contract.

## Recognition and provider binding

Automatic recognition is useful when an executable enters through a generic
path such as Finder selection, drag and drop, or manual registration. It must
not be required when the caller has already selected an operation.

Provider resolution order should be:

1. Provider explicitly selected by the current action.
2. Provider binding saved with an installed Bottle app.
3. A user-saved executable association.
4. A high-confidence Provider Recognizer result.
5. User selection when results are missing or ambiguous.
6. The generic Wine app or generic installer provider.

### Renamed installer example

If a user selects the built-in **Install Steam** action and supplies a file named
`stea1.exe`, the request remains explicit:

```ts
{
  kind: "install-launcher",
  providerId: "steam",
  artifact: selectedExecutableHandle,
  resolution: "explicit",
}
```

The file name does not change the selected Strategy. The Steam Strategy may ask
the Context to inspect and validate the artifact, but it does not infer its own
identity from the name.

When the same executable is supplied through a generic **Run EXE** action, the
Steam Recognizer can score several signals:

- PE `OriginalFilename`.
- PE `ProductName` and `CompanyName`.
- Signature or trusted publisher metadata.
- Known installer metadata or source information.
- Expected neighboring files and manifests.
- Known installation paths.
- The current file name as a low-confidence hint.

A renamed `SteamSetup.exe` will commonly retain its PE metadata and can still
produce a high-confidence Steam installer match. If metadata is missing or
conflicting, the launcher asks the user which provider and operation to use.

Explicit selection represents user intent, not proof that the artifact is
authentic. Context capability restrictions and artifact validation still apply.

### Saved binding

Once an app is installed or registered, the provider selection is stored with
the stable app metadata:

```ts
interface ExecutionBinding {
  providerId: string;
  operation: "launch";
  providerApiVersion: number;
  profileVersion?: number;
}
```

Future launches use this binding and do not repeat heuristic recognition.

## Execution sessions and UI state

Live execution belongs in an `ExecutionSessionStore`, not in
`Bottle.apps[].processId` or repeated Bottle metadata writes.

```ts
interface ExecutionSession {
  id: string;
  bottleId: string;
  providerId: string;
  operation: ExecutionRequest["kind"];
  phase: "preparing" | "running" | "handoff" | "completed" | "failed";
  activeHandles: string[];
  startedAt: string;
}
```

The UI derives **Running**, installer progress, and handoff state from active
sessions. It does not require a discovered app to exist before showing that a
Bottle has an active installer session.

For Steam, the same session ID survives the handoff:

```text
install-launcher session created
  -> installer handle becomes active
  -> SteamSetup.exe parent exits; session stays active
  -> steam.exe is detected
  -> session phase changes to handoff
  -> app handle becomes active
  -> UI shows Steam as running
  -> prefix becomes idle
  -> session completes
```

## Persistence rules

`BottleRepository` remains the single owner of persistent Bottle metadata.
Strategies and Context implementations do not write it directly.

Persistent updates occur only at stable domain transitions, for example:

- A selected runtime changes.
- An app is installed or removed.
- An execution binding is created or migrated.
- User launch options change.
- A launcher installation reaches a confirmed terminal result.

The following remain in memory or session logs:

- Download percentage.
- Installer process IDs.
- Current handoff phase.
- Temporary errors that have not changed installed state.
- Prefix watcher state.

Repository writes should be serialized and atomic. A failed or partial metadata
read must not promote a known Bottle into a scanned Bottle with an empty runtime
binding.

## Provider trust and external distribution

### Built-in providers

Built-in Strategies can be trusted TypeScript modules, but they still use the
same Context interface and validation path as other providers. They must not
import internal managers directly.

### External application providers

An external provider package declares:

- Provider ID and API version.
- Profile and recognition schema versions.
- Required Context capabilities.
- Supported operations.
- Strategy entry points.
- Publisher and integrity information.

Capability approval happens before the Context is created.

### User-provided Strategies

A restricted Context does not make arbitrary JavaScript safe by itself. User
code can still import Node APIs, block the event loop, or access ambient process
state unless it runs outside the trusted main process.

If user-authored code Strategies are supported, they require:

- A Worker or sandbox without Node.js access.
- A message-based proxy for Context calls.
- Serializable arguments and results only.
- Execution time, memory, and call-count limits.
- Capability approval and audit logs.
- Cancellation that the main process can enforce.

A simpler initial user extension format can be a declarative recipe interpreted
by a built-in Strategy. Both formats can target the same Context capabilities.

## Versioning

Provider compatibility must be explicit:

```ts
interface ExecutionProviderManifest {
  id: string;
  providerVersion: string;
  executionApiVersion: number;
  profileSchemaVersion: number;
  capabilities: ExecutionCapability[];
}
```

The registry rejects unsupported major API versions before execution. Saved
bindings retain the provider API version so migrations can be performed without
re-running recognition.

## Migration plan

The architecture should be introduced incrementally.

### Phase 0: Preserve current Steam behavior

- Add a regression test using a clean prefix.
- Model `SteamSetup.exe` exiting before `steam.exe` appears.
- Verify that parent exit does not end executable discovery.
- Verify that the active session is handed to the discovered Steam app.
- Verify that the Bottle shows an active session before app discovery.

### Phase 1: Separate transient sessions

- Extract prefix and process session tracking into `ExecutionSessionStore`.
- Make the UI derive running state from sessions.
- Stop persisting progress-only Bottle updates.
- Serialize and atomically replace Bottle metadata writes.

### Phase 2: Introduce explicit requests

- Replace optional `executionMode` flags with discriminated request types.
- Validate requests at the IPC boundary.
- Store an `ExecutionBinding` for installed apps.

### Phase 3: Introduce Provider and Context contracts

- Add `ProviderRegistry`.
- Add a per-session Context factory with opaque handles.
- Move Steam installation and launch into the first provider Strategies.
- Keep `BottleExecutionManager` as a compatibility facade during migration.

### Phase 4: Move remaining application behavior

- Move HoYoPlay installation and launch behavior to its provider.
- Move supported game-specific behavior into provider Strategies.
- Remove application-specific branches from the compatibility manager.

### Phase 5: External providers

- Version the provider package format.
- Add capability review and integrity checks.
- Add a sandboxed Context proxy before allowing user-authored code.

## Required tests

At minimum, the execution contract needs tests for:

- A clean Steam installation where the parent installer exits before
  `steam.exe` appears.
- A renamed Steam installer explicitly bound to the Steam provider.
- A renamed installer recognized through retained PE metadata.
- An ambiguous executable that requires user selection.
- A saved provider binding that bypasses repeated recognition.
- Cancellation during download, prefix setup, installer execution, and handoff.
- Prefix idle before target executable detection.
- Timeout while child processes remain alive.
- Session cleanup after Strategy failure.
- Rejection of an opaque handle from another session.
- Rejection of undeclared capabilities.
- No persistent Bottle write for progress-only events.
- Atomic metadata recovery after a simulated interrupted write.

## Architectural invariant

The final boundary should remain simple:

> A Provider describes and recognizes an application. A Strategy orders
> application-specific work. A launcher-created Context performs only approved
> semantic operations. The execution manager coordinates the contract without
> knowing how Steam, HoYoPlay, or a game works.
