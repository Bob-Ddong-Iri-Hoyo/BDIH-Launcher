# Bottle application launch deduplication

Status: the Main-owned lifecycle registry and registered-application
deduplication are implemented. Provider-semantic identity across separately
registered/direct-execution routes remains future work.

`BottleExecutionStateRegistry` owns versioned `preparing`, `starting`,
`running`, `stopping`, and `failed` states. `BottleExecutionManager` reserves a
canonical Prefix/application target before asynchronous preparation.
Concurrent requests join one launch Promise, an already-running target returns
its existing logical process ID, and requests received during shutdown receive
a retryable failure instead of racing `wineserver -k`. These lifecycle
decisions are logged at `info` level without raw arguments.

HoYoPlay stop requests also carry Bottle/application identity. Main can
therefore resolve a stale or missing Renderer process ID back to the active
Prefix session. Prefix stop is complete only after managed-process discovery
confirms that no process remains; the TERM/KILL fallback and its detected,
terminated, and remaining PID sets are written to the Wine log.

## Scope

This document covers duplicate requests to launch an application inside a
Bottle.

It does not cover:

- Electron's launcher-wide single-instance lock;
- Wine process cleanup during BDIH shutdown or crash recovery;
- valid process replacement during a launcher self-update;
- helper processes or child processes created by an already-running
  application;
- provider-level duplicate routing such as the HoYoPlay game proxy's existing
  target ownership check.

A duplicate launch means that Main receives more than one request for the same
logical application target while the first request is still starting or while
that target is already running.

## Implemented behavior

The registered-app launch path now has this authority flow:

```text
Bottle card or IPC caller
  -> invoke BOTTLE.RUN_EXECUTABLE
  -> Main resolves canonical Prefix + application target
  -> reserve or join the Main launch Promise
  -> process/Prefix telemetry updates Main state
  -> versioned snapshot/event is projected by Renderer
```

Renderer no longer owns `launchingAppsRef`, an exited-process cache, or an
active Prefix-session map for application state. It sends logical launch/stop
commands and renders `GET_EXECUTION_STATE` /
`EXECUTION_STATE_UPDATE`. A Renderer reload cannot bypass the Main reservation.

## Required ownership rule

Main is the final authority for application launch ownership.

Main reserves a logical launch target before the first asynchronous
preparation step that could allow another request to pass.

The required flow is:

```text
Renderer or another IPC caller
  -> Main resolves a logical target key
  -> Main atomically reserves or finds that key
     -> launching: join the existing launch
     -> running: return the existing logical process ID
     -> stopping: reject with a retryable status
     -> idle: reserve, prepare, and spawn
  -> Prefix/process observation updates target lifetime
  -> final exit or failed launch releases the key
```

Concurrent callers for the same target must observe one launch result. They
must not start multiple bootstrap Wine processes and then merge their tracking
state afterward.

## Logical target identity

The lock must not use only `bottleId` or Prefix path. Steam can legitimately
run multiple different games in one launcher Prefix, and a Prefix-wide lock
would incorrectly block those launches.

The target key should have this conceptual shape:

```ts
interface BottleExecutionTargetKey {
  prefixPath: string;
  targetId: string;
  executionClass: "application" | "installer";
}
```

`prefixPath` must use the same canonical normalization as Prefix-session
tracking. `targetId` should describe process identity rather than UI identity:

- a provider-owned identity for known targets, such as `hoyoplay`,
  `hoyo:hsr`, or `steam:500`;
- a normalized executable path for a generic or manually registered
  application;
- a provider-defined semantic identifier when arguments select the target,
  such as a Steam AppID.

The implemented registered-app key uses Bottle ID, canonical Prefix path, and
app ID. `appId` alone would not be sufficient. The same executable can be registered twice
or reached once through a registered card and once through direct execution.
Those routes should resolve to the same target when they represent the same
logical application.

Arguments must be included only when a provider declares that they select
different logical targets. Arbitrarily hashing all arguments would allow a
duplicate merely because a non-semantic flag changed, and logging raw arguments
could expose tokens or user data.

Installer execution is a separate class because it mutates Prefix contents and
has different completion rules. An installer policy may be stricter than an
application policy, but it must not accidentally share an application key.

## State and result behavior

Main maintains target records independent of persistent Bottle metadata:

```ts
type BottleExecutionPhase =
  | "preparing"
  | "starting"
  | "running"
  | "stopping"
  | "failed";
```

Required behavior:

1. Insert the `launching` record synchronously before availability checks,
   Prefix setup, runtime preparation, registry changes, or process spawning.
2. If an identical request arrives while launching, return or await the same
   Promise.
3. When launch succeeds, replace the reservation with the logical running
   process or Prefix-session ID returned to the Renderer.
4. If the target is already running, return `{ ok: true, processId }` without
   spawning again. Focusing the existing application can be added separately.
5. On validation failure, rejected spawn, or early-exit failure, retain a
   structured failed state until retry.
6. On observed final target exit, remove the running record.
7. During an explicit stop, retain a `stopping` record until the process is
   confirmed stopped. A new launch must not race `wineserver` shutdown.

The exposed `processId` should identify the logical tracked lifetime. A
bootstrap executable can exit during a valid Steam or HoYoPlay handoff without
releasing the target.

## Prefix sessions and multiple applications

Prefix sessions and target locks answer different questions:

- Prefix session: whether the Wine Prefix and its Wineserver are active.
- Target lock: whether a particular user-facing application is launching,
  running, or stopping.

One Prefix session may therefore own multiple target records. This is required
for Steam and any future shared-prefix provider.

Wine process telemetry, a provider supervisor, or the existing Wineserver
waiter may close a target record. Prefix shutdown closes every target owned by
that Prefix. Closing one Steam game target must not close the Steam launcher or
another Steam game target.

## Logging

A prevented or coalesced duplicate is an application lifecycle event and
should be logged at `info` level. The record should contain only sanitized
identity:

- Bottle ID and name;
- canonical Prefix path;
- logical target ID;
- execution class;
- current state;
- existing logical process ID when available;
- whether the request was joined, reused, or rejected.

Raw executable arguments and command lines must not be included. Unexpected
state mismatches, such as a running record whose Prefix session no longer
exists, should be logged at `warn` and reconciled before another launch is
allowed.

## Required tests

At minimum, Main-level tests must verify:

1. Two concurrent identical requests spawn Wine exactly once and receive the
   same logical process ID.
2. A request made while the target is running returns the existing process ID
   without spawning Wine.
3. A failed launch releases its reservation and permits a later retry.
4. A completed target exit releases its running record.
5. A request arriving during stop does not race Prefix shutdown.
6. Two different registered applications can run when their target keys are
   different.
7. Two different Steam AppIDs can run in the same Steam Prefix.
8. The same Steam AppID cannot be launched twice.
9. Registered and direct-execution routes to the same generic executable
   resolve to the same target.
10. A launcher or updater handoff does not release the logical target merely
    because its bootstrap process exited.

Renderer tests cover projection of Main snapshots, not repeated-click
suppression. Main tests are the authority for concurrency and lifecycle rules.

## Acceptance criteria

The registered-application work is complete: duplicate protection remains
correct without a Renderer guard, no duplicate Wine bootstrap process is
created for an identical concurrent request, shared-prefix providers can still
project distinct applications, and reservations are deterministically updated
after failure, stop, or final observed exit.

The remaining acceptance target is provider-semantic identity: a registered
route and a direct-execution route for the same executable/Steam AppID must
resolve to the same target without hashing non-semantic or sensitive arguments.
