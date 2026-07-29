# App-data lifecycle and channel-safe cleanup

BDIH keeps user-selected Bottle settings, Wine prefixes, game data, and
app-owned metadata outside the application bundle. Replacing the app must not
treat an unrecognized file as unused: a different channel or an older return
target may still understand it.

## Authority and ownership

- `appmeta.json` and each Bottle root's `bdih-bottle.json` are the authoritative
  Bottle registry and Recipe metadata.
- Prefix-local `bdih-bottle.json` files are currently compatibility,
  snapshot, rename, and discovery metadata. They are not the runtime authority,
  but they are not retired yet.
- Wine-owned files such as `system.reg`, `user.reg`, `userdef.reg`,
  `.update-timestamp`, `dosdevices`, and `drive_c` are never app-data cleanup
  targets.
- BDIH runtime cache receipts and drive markers remain in use while their owning
  feature exists.
- Transient FIFO, lock, and database journal cleanup belongs to process or seed
  preparation, not application-channel maintenance.

## Cleanup eligibility

The launcher records the last successfully opened application version and its
build channel in `app-data-lifecycle.json`. Cleanup runs only when both records
exist, the version changed, and the build channel stayed the same.

| Previous build | Current build | Retired-file cleanup |
| --- | --- | --- |
| Stable | Stable | Allowed |
| Beta | Beta | Allowed |
| Nightly | Nightly | Allowed |
| Stable | Beta | Preserved |
| Beta | Stable | Preserved |
| First observed launch | Any | Preserved |
| Same version | Same channel | Skipped |

Changing the selected update feed without installing another build does not
trigger cleanup. Nightly is identified by its packaged build identity; Beta is
identified by the installed app version.

## Retirement rules

Cleanup is allowlist-based. Every retired path must be registered in
`AppDataMaintenanceManager`, limited to BDIH-owned data under a known Bottle,
and safe to remove repeatedly. The launcher must never enumerate unknown files
and delete them merely because the current build has no reader for them.

The first registered retirement removes only legacy
`<prefix>/_bdih_installers/*.bdih.json` download sidecars. Current installer
metadata lives below the Bottle root's `.cache/installers` directory. The
legacy installer executable is retained as a fallback, and prefix-local
`bdih-bottle.json` remains untouched until its snapshot, compatibility, rename,
and discovery consumers have migrated to a replacement schema.

If an eligible cleanup fails, the lifecycle marker is not advanced. The
idempotent retirement is retried at the next startup.

## Snapshots and channel transitions

Stable to Beta creates the Stable return point before Beta can modify
app-owned metadata. Cross-channel startup still suppresses retired-file cleanup;
the snapshot is an emergency compatibility mechanism, not permission to delete
the live copy. Destructive Bottle, app, or Prefix operations continue to create
their dedicated recovery snapshots independently of channel maintenance.
