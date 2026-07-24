import { existsSync, readlinkSync, type Dirent } from "fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "fs/promises";
import path from "path";
import {
  BottleListPayload,
  BottleLauncherKind,
  BottleMetadataPayload,
  BottlePrefixMetadataPayload,
  BottleTaskStatePayload,
  BottleTaskStage,
  DeleteBottleAppPayload,
  DeleteBottleAppResultPayload,
  DeleteBottlePayload,
  DeleteBottlePrefixPayload,
  DeleteBottlePrefixResultPayload,
  DeleteBottleResultPayload,
  InstalledBottleAppPayload,
} from "../../Common/Types/IPC";
import { HOYOPLAY_ICON_URL, STEAM_GAME_LAUNCH_ARGUMENT, STEAM_ICON_URL } from "../../Common/Constant/RuntimeSources";
import { BOTTLE_REGISTRY_SCHEMA_VERSION } from "../../Common/Constant/DataSchema";
import { assign_missing_bottle_icon_ids, is_bottle_icon_id } from "../../Common/Util/BottleIcon";
import {
  bottle_name_to_slug,
  create_bottle_app_prefix_path,
  create_default_wine_prefix_path,
  create_hoyo_game_prefix_path,
  create_launcher_prefix_path,
  hoyo_game_from_bottle_app,
  is_internal_bottle_prefix_dir_name,
  launcher_from_bottle_app,
} from "../../Common/Util/BottlePath";
import { normalize_launch_options } from "../../Common/Util/LaunchOptions";
import { readConfigFile } from "../FileIO/IO";
import {
  get_bottle_registry_path,
  get_legacy_bottle_prefix_paths,
  get_legacy_bottle_registry_paths,
  get_legacy_settings_path,
  is_dev_resource_environment,
} from "../Environment/AppPaths";
import { preferenceManager } from "./PreferenceManager";
import { logManager } from "./LogManager";
import { iconManager } from "./IconManager";
import { get_launcher_runtime_profile } from "../Data/GameProfile";
import { find_runtime_profile_executable } from "../Util/RuntimeExecutableDiscovery";
import { snapshotManager } from "./SnapshotManager";

const REGISTRY_VERSION = BOTTLE_REGISTRY_SCHEMA_VERSION;
const HOYO_EXE_SCAN_MAX_DEPTH = 8;
const HOYO_EXE_SCAN_MAX_ENTRIES = 5000;
const HOYO_EXCLUDED_EXE_PATTERN = /(crash|crashreport|unitycrashhandler|browser|helper|setup|install|uninstall|update|launcher|plugin|cef|zfgamebrowser|iexplore|explorer|winebrowser|notepad|wordpad|regedit|rundll32|cmd|conhost|msiexec|control)/i;
const HOYO_SCAN_SKIP_DIRECTORY_PATTERN = /^(windows|\$recycle\.bin|temp|tmp|_bdih_installers|logs?|steamapps|cache)$/i;
const STEAM_GAME_EXE_SCAN_MAX_DEPTH = 5;
const STEAM_GAME_EXE_SCAN_MAX_ENTRIES = 2000;
const STEAM_GAME_EXCLUDED_EXE_PATTERN = /(crash|crashreport|unitycrashhandler|redist|redistributable|setup|install|uninstall|updater?|launcher|bootstrap|cef|helper|service|tool|vcredist|directx|dxsetup|eac|easyanticheat)/i;
const STEAM_GAME_SKIP_DIRECTORY_PATTERN = /^(windows|\$recycle\.bin|temp|tmp|_commonredist|redist|redistributable|directx|vcredist|bin64_steamruntime)$/i;

interface HoYoGameCatalogEntry {
  id: "zzz" | "starrail" | "genshin";
  name: string;
  executableNames: string[];
  pathTokens: string[];
}

const HOYO_GAME_CATALOG: HoYoGameCatalogEntry[] = [
  {
    id: "zzz",
    name: "Zenless Zone Zero",
    executableNames: ["ZenlessZoneZero.exe"],
    pathTokens: ["zenlesszonezero", "zenless", "zzz"],
  },
  {
    id: "starrail",
    name: "Honkai: Star Rail",
    executableNames: ["StarRail.exe"],
    pathTokens: ["starrail", "star-rail", "honkaistarrail", "honkai", "hsr"],
  },
  {
    id: "genshin",
    name: "Genshin Impact",
    executableNames: ["GenshinImpact.exe", "YuanShen.exe"],
    pathTokens: ["genshinimpact", "genshin", "yuanshen"],
  },
];

interface BottleRegistryState {
  bottles: BottleMetadataPayload[];
  deletedBottleKeys: string[];
}

interface SteamInstallDetection {
  app: InstalledBottleAppPayload;
  steamRootPath: string;
  prefixPath: string;
}

export interface SteamGameLaunchReconciliationResult {
  appId: string;
  registered: boolean;
  changed: boolean;
}

/**
 * Maintains bottle metadata across three sources:
 *
 * 1. The explicit bottle registry in app data.
 * 2. Prefix-local `bdih-bottle.json` metadata.
 * 3. Scanned Wine prefixes that look like bottles.
 *
 * Deletions must write tombstone keys because scanning can otherwise rediscover
 * an old prefix or legacy registry entry and make it appear again.
 */
export class BottleManager {
  private cache: BottleMetadataPayload[] | null = null;
  private registryOperationQueue: Promise<void> = Promise.resolve();

  async bootstrapAppMetadata(): Promise<void> {
    // Startup reconciliation runs while the splash window is visible. It makes
    // the app-level registry (`appmeta.json`) match real prefix directories
    // before the renderer asks for bottles, so deleted prefixes do not reappear.
    const registry = await this.loadRegistryState();
    const bottles = await this.buildBottleList([], registry);

    this.cache = bottles;
    await this.writeRegistryBottles(bottles, registry.deletedBottleKeys);
  }

  getBottleList(forceReload = false): Promise<BottleListPayload> {
    return this.runRegistryOperation(() => this.getBottleListUnlocked(forceReload));
  }

  private async getBottleListUnlocked(forceReload = false): Promise<BottleListPayload> {
    if (!this.cache || forceReload) {
      const registry = await this.loadRegistryState();

      this.cache = await this.buildBottleList([], registry);
      await this.writeRegistryBottles(this.cache, registry.deletedBottleKeys);
    }

    return {
      bottles: this.cache,
    };
  }

  saveBottleList(payload: BottleListPayload): Promise<BottleListPayload> {
    return this.runRegistryOperation(() => this.saveBottleListUnlocked(payload));
  }

  private async saveBottleListUnlocked(payload: BottleListPayload): Promise<BottleListPayload> {
    // Save is a merge operation, not a destructive replace. This preserves
    // scanned/legacy bottles during normal app updates. Use deleteBottle or
    // clearAllBottleData when data should actually disappear.
    const registry = await this.loadRegistryState();
    const normalizedIncomingBottles = normalize_bottle_array(payload?.bottles);

    const incomingBottles = await rename_incoming_bottle_directories(
      normalizedIncomingBottles,
      registry.bottles,
    );
    const deletedBottleKeys = deleted_keys_without_incoming_bottles(
      registry.deletedBottleKeys,
      incomingBottles,
    );
    const bottles = await this.buildBottleList(incomingBottles, {
      ...registry,
      deletedBottleKeys,
    });

    await this.writeRegistryBottles(bottles, deletedBottleKeys);

    this.cache = bottles;

    return {
      bottles,
    };
  }

  async upsertBottleApp(payload: {
    bottleId: string;
    bottleName: string;
    bottlePath: string;
    wineVersionId: string;
    dxmtVersionId?: string;
    jadeiteVersionId?: string;
    app: InstalledBottleAppPayload;
    iconExecutablePath?: string;
  }): Promise<void> {
    const registry = await this.loadRegistryState();
    const bottlePath = path.resolve(expand_user_home_path(payload.bottlePath));
    const registryBottle = registry.bottles.find((candidateBottle) =>
      candidateBottle.id === payload.bottleId ||
      path.resolve(expand_user_home_path(candidateBottle.path)) === bottlePath,
    );
    const cachedBottle = this.cache?.find((candidateBottle) =>
      candidateBottle.id === payload.bottleId ||
      path.resolve(expand_user_home_path(candidateBottle.path)) === bottlePath,
    );
    const now = new Date().toISOString();
    const baseBottle: BottleMetadataPayload = registryBottle ?? cachedBottle ?? {
      id: payload.bottleId,
      name: payload.bottleName || path.basename(bottlePath),
      description: "",
      wineVersionId: payload.wineVersionId,
      dxmtVersionId: payload.dxmtVersionId,
      jadeiteVersionId: payload.jadeiteVersionId,
      path: bottlePath,
      status: "ready",
      apps: [],
      createdAt: now,
      updatedAt: now,
    };
    const iconSrc = payload.app.iconSrc ?? (
      payload.iconExecutablePath && existsSync(payload.iconExecutablePath)
        ? await iconManager.extractExecutableIcon(payload.iconExecutablePath, bottle_icon_cache_path(baseBottle.path))
        : undefined
    );
    const app: InstalledBottleAppPayload = {
      ...payload.app,
      id: canonical_bottle_app_id(payload.app.id),
      wineVersionId: payload.app.wineVersionId || baseBottle.wineVersionId || payload.wineVersionId,
      source: payload.app.source ?? "manual",
      lastPlayed: payload.app.lastPlayed || "Never launched",
      status: payload.app.status ?? "ready",
    };

    if (iconSrc) {
      app.iconSrc = iconSrc;
    }

    const updatedBottle: BottleMetadataPayload = {
      ...baseBottle,
      wineVersionId: baseBottle.wineVersionId || payload.wineVersionId,
      dxmtVersionId: baseBottle.dxmtVersionId ?? payload.dxmtVersionId,
      jadeiteVersionId: baseBottle.jadeiteVersionId ?? payload.jadeiteVersionId,
      status: baseBottle.status === "needs-setup" ? "ready" : baseBottle.status,
      hiddenAppIds: baseBottle.hiddenAppIds?.filter((appId) => appId !== app.id),
      apps: merge_apps(baseBottle.apps, [app]),
      updatedAt: now,
    };
    const upsertBottle = (bottles: BottleMetadataPayload[]): BottleMetadataPayload[] => {
      let replaced = false;
      const nextBottles = bottles.map((candidateBottle) => {
        const matches = candidateBottle.id === updatedBottle.id ||
          path.resolve(expand_user_home_path(candidateBottle.path)) === bottlePath;

        if (!matches) {
          return candidateBottle;
        }

        replaced = true;
        return updatedBottle;
      });

      return replaced ? nextBottles : [...nextBottles, updatedBottle];
    };
    const updatedBottleKeys = new Set([...bottle_identity_keys(updatedBottle), bottle_path_key(bottlePath)]);
    const deletedBottleKeys = normalize_deleted_bottle_keys(
      registry.deletedBottleKeys.filter((key) => !updatedBottleKeys.has(key)),
    );
    const bottles = upsertBottle(registry.bottles);

    this.cache = this.cache ? upsertBottle(this.cache) : bottles;
    await this.writeRegistryBottles(bottles, deletedBottleKeys);
    await write_prefix_metadata(updatedBottle);
  }

  reconcileSteamGameLaunch(payload: {
    bottleId: string;
    bottlePath: string;
    steamAppId: string;
  }): Promise<SteamGameLaunchReconciliationResult> {
    return this.runRegistryOperation(() => this.reconcileSteamGameLaunchUnlocked(payload));
  }

  private async reconcileSteamGameLaunchUnlocked(payload: {
    bottleId: string;
    bottlePath: string;
    steamAppId: string;
  }): Promise<SteamGameLaunchReconciliationResult> {
    const steamAppId = payload.steamAppId.trim();
    const appId = canonical_bottle_app_id(`steam:${steamAppId}`);

    if (!/^\d+$/.test(steamAppId)) {
      return {
        appId,
        registered: false,
        changed: false,
      };
    }

    const bottlePath = path.resolve(expand_user_home_path(payload.bottlePath));
    let registry = await this.loadRegistryState();
    let bottle = find_bottle_by_identity(registry.bottles, payload.bottleId, bottlePath);

    // A process session can start before the first renderer-side bottle load.
    // Populate the registry from prefix metadata/scanning before deciding that
    // the Steam game has no owning bottle.
    if (!bottle) {
      await this.getBottleListUnlocked(true);
      registry = await this.loadRegistryState();
      bottle = find_bottle_by_identity(registry.bottles, payload.bottleId, bottlePath);
    }

    if (!bottle) {
      return {
        appId,
        registered: false,
        changed: false,
      };
    }

    const targetBottleId = bottle.id;
    const registeredApp = bottle.apps.find((app) => app.id === appId);
    const wasRegistered = Boolean(registeredApp);
    const wasHidden = bottle.hiddenAppIds?.includes(appId) ?? false;

    if (wasRegistered && !wasHidden && registeredApp?.steamLaunchConfirmedAt) {
      return {
        appId,
        registered: true,
        changed: false,
      };
    }

    // Steam's game-process log is the authoritative registration signal. The
    // normal bottle scan deliberately does not enumerate every manifest, since
    // G: can already expose a shared library before the user signs in or adds
    // that library to this Steam installation.
    const steamInstall = await detect_steam_install(bottle);
    const detectedApp = steamInstall
      ? await detect_launched_steam_game(bottle, steamInstall, steamAppId)
      : null;

    if (!detectedApp) {
      return {
        appId,
        registered: false,
        changed: false,
      };
    }

    const now = new Date().toISOString();
    let reconciledBottle: BottleMetadataPayload | undefined;
    const updateBottle = (candidateBottle: BottleMetadataPayload): BottleMetadataPayload => {
      if (!bottle_matches_identity(candidateBottle, targetBottleId, bottlePath)) {
        return candidateBottle;
      }

      reconciledBottle = {
        ...candidateBottle,
        hiddenAppIds: candidateBottle.hiddenAppIds?.filter((hiddenAppId) => hiddenAppId !== appId),
        apps: merge_apps(candidateBottle.apps, [detectedApp]),
        updatedAt: now,
      };
      return reconciledBottle;
    };
    const bottles = registry.bottles.map(updateBottle);

    this.cache = this.cache?.map(updateBottle) ?? bottles;
    await this.writeRegistryBottles(bottles, registry.deletedBottleKeys);
    if (reconciledBottle) {
      await write_prefix_metadata(reconciledBottle);
    }

    return {
      appId,
      registered: true,
      changed: wasHidden || !wasRegistered,
    };
  }

  private runRegistryOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.registryOperationQueue.then(operation, operation);

    this.registryOperationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async updateBottleLauncherTask(payload: {
    bottleId: string;
    bottlePath: string;
    launcher: BottleLauncherKind;
    task: BottleTaskStatePayload;
  }): Promise<void> {
    const registry = await this.loadRegistryState();
    const bottlePath = path.resolve(expand_user_home_path(payload.bottlePath));
    let updatedBottle: BottleMetadataPayload | undefined;
    const updateBottle = (bottle: BottleMetadataPayload): BottleMetadataPayload => {
      const matches = bottle.id === payload.bottleId ||
        path.resolve(expand_user_home_path(bottle.path)) === bottlePath;

      if (!matches) {
        return bottle;
      }

      updatedBottle = {
        ...bottle,
        launcherTasks: {
          ...bottle.launcherTasks,
          [payload.launcher]: payload.task,
        },
        updatedAt: new Date().toISOString(),
      };

      return updatedBottle;
    };
    const bottles = registry.bottles.map(updateBottle);

    this.cache = this.cache?.map(updateBottle) ?? bottles;
    await this.writeRegistryBottles(bottles, registry.deletedBottleKeys);
    if (updatedBottle) {
      await write_prefix_metadata(updatedBottle);
    }
  }

  async deleteBottle(payload: DeleteBottlePayload): Promise<DeleteBottleResultPayload> {
    const bottlePath = path.resolve(expand_user_home_path(payload.bottlePath));
    const preference = await preferenceManager.getPreference();
    const prefixRoot = path.resolve(expand_user_home_path(preference.bottlePrefixPath));

    if (!is_safe_bottle_delete_path(bottlePath) || bottlePath === prefixRoot) {
      return {
        ok: false,
        error: `Unsafe bottle delete path: ${bottlePath}`,
      };
    }

    try {
      await snapshotManager.ensurePrefixSnapshot({
        bottleId: payload.bottleId,
        prefixPath: bottlePath,
      });
      await rm(bottlePath, { recursive: true, force: true });

      const registry = await this.loadRegistryState();
      const deletedBottle = registry.bottles.find((bottle) =>
        bottle.id === payload.bottleId || path.resolve(expand_user_home_path(bottle.path)) === bottlePath,
      );
      const deletedLogPaths = logManager.deleteBottleLogs({
        bottleId: payload.bottleId,
        bottleName: payload.bottleName || deletedBottle?.name || path.basename(bottlePath),
      });
      // Registry tombstones prevent the deleted prefix from reappearing if a
      // legacy registry or a later prefix scan still knows about it.
      const deletedBottleKeys = normalize_deleted_bottle_keys([
        ...registry.deletedBottleKeys,
        `id:${payload.bottleId}`,
        bottle_path_key(bottlePath),
      ]);
      const bottles = registry.bottles.filter((bottle) =>
        bottle.id !== payload.bottleId && path.resolve(expand_user_home_path(bottle.path)) !== bottlePath,
      );

      this.cache = this.cache?.filter((bottle) =>
        bottle.id !== payload.bottleId && path.resolve(expand_user_home_path(bottle.path)) !== bottlePath,
      ) ?? bottles;
      await this.writeRegistryBottles(bottles, deletedBottleKeys);

      return {
        ok: true,
        deletedPath: bottlePath,
        deletedLogPaths,
      };
    } catch (error) {
      return {
        ok: false,
        deletedPath: bottlePath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async deleteBottleApp(payload: DeleteBottleAppPayload): Promise<DeleteBottleAppResultPayload> {
    const registry = await this.loadRegistryState();
    const bottlePath = path.resolve(expand_user_home_path(payload.bottlePath));
    const bottle = registry.bottles.find((candidateBottle) =>
      candidateBottle.id === payload.bottleId ||
      path.resolve(expand_user_home_path(candidateBottle.path)) === bottlePath,
    );
    const app = bottle?.apps.find((candidateApp) => candidateApp.id === payload.appId);

    if (!bottle) {
      return {
        ok: false,
        deletedPaths: [],
        skippedPaths: [],
        error: "Bottle app was not found.",
      };
    }

    const mode = payload.mode ?? "files";
    const deletedPaths: string[] = [];
    const skippedPaths: DeleteBottleAppResultPayload["skippedPaths"] = [];
    const shouldHideFromDiscovery = mode === "list" || !app;

    if (mode === "files" && app) {
      try {
        await snapshotManager.ensurePrefixSnapshot({
          bottleId: bottle.id,
          prefixPath: bottlePath,
        });
      } catch (error) {
        return {
          ok: false,
          deletedPaths,
          skippedPaths,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      const preference = await preferenceManager.getPreference();
      const deletePlan = await resolve_bottle_app_delete_plan(bottle, app, preference.gameInstallPath);

      for (const targetPath of deletePlan.targets) {
        if (!existsSync(targetPath)) {
          skippedPaths.push({ path: targetPath, reason: "missing" });
          continue;
        }

        if (!is_safe_app_delete_path(targetPath, deletePlan.safeRoots)) {
          skippedPaths.push({ path: targetPath, reason: "outside safe delete roots" });
          continue;
        }

        try {
          await rm(targetPath, { recursive: true, force: true });
          deletedPaths.push(targetPath);
        } catch (error) {
          skippedPaths.push({
            path: targetPath,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const removedAppId = app?.id ?? canonical_bottle_app_id(payload.appId);
    const updateBottle = (candidateBottle: BottleMetadataPayload): BottleMetadataPayload =>
      candidateBottle.id === bottle.id
        ? {
            ...candidateBottle,
            hiddenAppIds: shouldHideFromDiscovery
              ? [...new Set([...(candidateBottle.hiddenAppIds ?? []), removedAppId])]
              : candidateBottle.hiddenAppIds,
            apps: candidateBottle.apps.filter((candidateApp) => candidateApp.id !== removedAppId),
            updatedAt: new Date().toISOString(),
          }
        : candidateBottle;
    const bottles = registry.bottles.map((candidateBottle) =>
      updateBottle(candidateBottle),
    );

    this.cache = this.cache?.map(updateBottle) ?? bottles;
    await this.writeRegistryBottles(bottles, registry.deletedBottleKeys);

    const blockingSkippedPaths = skippedPaths.filter((entry) => entry.reason !== "missing");

    return {
      ok: blockingSkippedPaths.length === 0,
      deletedPaths,
      skippedPaths,
      error: blockingSkippedPaths.length > 0 ? "Some app files were not deleted." : undefined,
    };
  }

  async deleteBottlePrefix(payload: DeleteBottlePrefixPayload): Promise<DeleteBottlePrefixResultPayload> {
    const registry = await this.loadRegistryState();
    const bottlePath = path.resolve(expand_user_home_path(payload.bottlePath));
    const prefixPath = path.resolve(expand_user_home_path(payload.prefixPath));
    const bottle = registry.bottles.find((candidateBottle) =>
      candidateBottle.id === payload.bottleId ||
      path.resolve(expand_user_home_path(candidateBottle.path)) === bottlePath,
    );

    if (!bottle) {
      return {
        ok: false,
        error: "Bottle was not found.",
      };
    }

    if (!is_safe_app_delete_path(prefixPath, [bottlePath])) {
      return {
        ok: false,
        deletedPath: prefixPath,
        error: `Unsafe prefix delete path: ${prefixPath}`,
      };
    }

    try {
      await snapshotManager.ensurePrefixSnapshot({
        bottleId: bottle.id,
        prefixPath,
      });
      if (existsSync(prefixPath)) {
        await rm(prefixPath, { recursive: true, force: true });
      }

      const removedAppIds = bottle.apps
        .filter((app) => bottle_app_uses_prefix(bottle, app, prefixPath))
        .map((app) => app.id);
      const bottles = registry.bottles.map((candidateBottle) =>
        candidateBottle.id === bottle.id
          ? {
              ...candidateBottle,
              prefixes: (candidateBottle.prefixes ?? []).filter((prefix) =>
                prefix.kind !== "custom" ||
                path.resolve(expand_user_home_path(prefix.path)) !== prefixPath,
              ),
              apps: candidateBottle.apps.filter((app) => !removedAppIds.includes(app.id)),
              updatedAt: new Date().toISOString(),
          }
        : candidateBottle,
      );
      const updatedBottle = bottles.find((candidateBottle) => candidateBottle.id === bottle.id);

      this.cache = this.cache?.map((candidateBottle) =>
        candidateBottle.id === bottle.id
          ? {
              ...candidateBottle,
              prefixes: (candidateBottle.prefixes ?? []).filter((prefix) =>
                prefix.kind !== "custom" ||
                path.resolve(expand_user_home_path(prefix.path)) !== prefixPath,
              ),
              apps: candidateBottle.apps.filter((app) => !removedAppIds.includes(app.id)),
              updatedAt: new Date().toISOString(),
            }
          : candidateBottle,
      ) ?? bottles;
      await this.writeRegistryBottles(bottles, registry.deletedBottleKeys);
      if (updatedBottle) {
        await write_prefix_metadata(updatedBottle);
      }

      return {
        ok: true,
        deletedPath: prefixPath,
        removedAppIds,
      };
    } catch (error) {
      return {
        ok: false,
        deletedPath: prefixPath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async clearAllBottleData(): Promise<void> {
    // Used by the Preference danger zone when bottle prefixes are deleted.
    // This bypasses saveBottleList's merge semantics and records every known
    // bottle as deleted so a later scan cannot resurrect stale entries.
    const registry = await this.loadRegistryState();
    const knownBottles = merge_bottles(registry.bottles, this.cache ?? []);
    const deletedBottleKeys = normalize_deleted_bottle_keys([
      ...registry.deletedBottleKeys,
      ...knownBottles.flatMap(bottle_identity_keys),
    ]);

    for (const bottle of knownBottles) {
      logManager.deleteBottleLogs({
        bottleId: bottle.id,
        bottleName: bottle.name,
      });
    }

    this.cache = [];
    await this.writeRegistryBottles([], deletedBottleKeys);
  }

  async snapshotAllBottlePrefixesForRecovery(): Promise<void> {
    const registry = await this.loadRegistryState();
    const knownBottles = merge_bottles(registry.bottles, this.cache ?? []);

    for (const bottle of knownBottles) {
      const prefixPaths = new Set([
        bottle.path,
        ...(bottle.prefixes ?? []).map((prefix) => prefix.path),
        ...bottle.apps.map((app) => app.prefixPath).filter((prefixPath): prefixPath is string => Boolean(prefixPath)),
      ]);

      for (const prefixPath of prefixPaths) {
        await snapshotManager.ensurePrefixSnapshot({
          bottleId: bottle.id,
          prefixPath,
        });
      }
    }
  }

  clearCache(): void {
    this.cache = null;
  }

  async flushPendingWrites(): Promise<void> {
    await this.registryOperationQueue;
  }

  private async buildBottleList(
    incomingBottles: BottleMetadataPayload[] = [],
    registry?: BottleRegistryState,
  ): Promise<BottleMetadataPayload[]> {
    // Order matters: explicit incoming renderer state wins, then registry, then
    // scanned prefixes. Every candidate is filtered through deletedBottleKeys.
    const registryState = registry ?? await this.loadRegistryState();
    const deletedBottleKeys = new Set(registryState.deletedBottleKeys);
    const registryBottles = registryState.bottles.filter((bottle) => !is_deleted_bottle(bottle, deletedBottleKeys));
    const scannedBottles = await this.scanDefaultPrefixBottles(registryState.bottles);
    const visibleIncomingBottles = incomingBottles.filter((bottle) => !is_deleted_bottle(bottle, deletedBottleKeys));
    const registryAndScannedBottles = merge_bottles(registryBottles, scannedBottles);
    const mergedBottles = merge_bottles(visibleIncomingBottles, registryAndScannedBottles);
    const appEnrichedBottles = await Promise.all(
      mergedBottles.map((bottle) => enrich_bottle_apps_from_prefix(bottle)),
    );
    const enrichedBottles = await Promise.all(
      appEnrichedBottles.map((bottle) => enrich_bottle_prefixes_from_disk(bottle)),
    );

    await Promise.all(enrichedBottles.map((bottle) => write_prefix_metadata(bottle)));

    return enrichedBottles;
  }

  private async writeRegistryBottles(
    bottles: BottleMetadataPayload[],
    deletedBottleKeys: string[] = [],
  ): Promise<void> {
    const preference = await preferenceManager.getPreference();
    const registryPath = get_bottle_registry_path(preference.dataRootPath);

    await mkdir(path.dirname(registryPath), { recursive: true });
    await writeFile(
      registryPath,
      JSON.stringify(
        {
          version: REGISTRY_VERSION,
          updatedAt: new Date().toISOString(),
          bottles,
          deletedBottleKeys: normalize_deleted_bottle_keys(deletedBottleKeys),
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  private async loadRegistryState(): Promise<BottleRegistryState> {
    const preference = await preferenceManager.getPreference();
    const primaryRegistryPath = get_bottle_registry_path(preference.dataRootPath);
    const primaryRegistryState = await this.readRegistryState(primaryRegistryPath);

    if (primaryRegistryState) {
      return this.validateRegistryState(primaryRegistryState);
    }

    const registryPaths = unique_paths([
      get_bottle_registry_path(),
      ...get_legacy_bottle_registry_paths(),
    ]).filter((registryPath) => path.resolve(registryPath) !== path.resolve(primaryRegistryPath));
    const states: BottleRegistryState[] = [];

    for (const registryPath of registryPaths) {
      const state = await this.readRegistryState(registryPath);

      if (state) {
        states.push(state);
      }
    }

    if (states.length === 0) {
      return {
        bottles: [],
        deletedBottleKeys: [],
      };
    }

    return this.validateRegistryState(merge_registry_states(states));
  }

  private async readRegistryState(registryPath: string): Promise<BottleRegistryState | null> {
    try {
      return parse_registry_state(await readFile(registryPath, "utf8"));
    } catch (error) {
      if (is_missing_file_error(error) || error instanceof SyntaxError) {
        return null;
      }

      throw error;
    }
  }

  private validateRegistryState(registry: BottleRegistryState): BottleRegistryState {
    const deletedBottleKeys = [...registry.deletedBottleKeys];
    const bottles = registry.bottles.filter((bottle) => {
      const bottlePath = path.resolve(expand_user_home_path(bottle.path));

      if (existsSync(bottlePath)) {
        return true;
      }

      deletedBottleKeys.push(...bottle_identity_keys(bottle), bottle_path_key(bottlePath));
      return false;
    });

    return {
      bottles,
      deletedBottleKeys: normalize_deleted_bottle_keys(deletedBottleKeys),
    };
  }

  private async scanDefaultPrefixBottles(registryBottles: BottleMetadataPayload[] = []): Promise<BottleMetadataPayload[]> {
    // Scan both the current preference path and legacy/dev locations. This is
    // helpful for migration, but it makes tombstones important after deletion.
    const preference = await preferenceManager.getPreference();
    const legacyPreferencePrefixPaths = await this.loadLegacyPreferenceBottlePrefixPaths();
    const registryBottlePaths = registryBottles
      .map((bottle) => optional_string(bottle.path))
      .filter((bottlePath): bottlePath is string => Boolean(bottlePath));
    const prefixRoots = unique_paths([
      preference.bottlePrefixPath,
      ...legacyPreferencePrefixPaths,
      ...get_legacy_bottle_prefix_paths(),
      ...registryBottlePaths,
      ...registryBottlePaths.map((bottlePath) => path.dirname(expand_user_home_path(bottlePath))),
    ].map(expand_user_home_path));

    const bottleGroups = await Promise.all(
      prefixRoots.map((prefixRoot) => this.scanPrefixRootBottles(prefixRoot)),
    );

    return merge_bottles([], bottleGroups.flat());
  }

  private async loadLegacyPreferenceBottlePrefixPaths(): Promise<string[]> {
    if (!is_dev_resource_environment()) {
      return [];
    }

    try {
      const parsed = JSON.parse(await readConfigFile(get_legacy_settings_path())) as unknown;
      const bottlePrefixPath = is_record(parsed) ? optional_string(parsed.bottlePrefixPath) : undefined;

      return bottlePrefixPath ? [bottlePrefixPath] : [];
    } catch (error) {
      if (is_missing_file_error(error)) {
        return [];
      }

      throw error;
    }
  }

  private async scanPrefixRootBottles(prefixRoot: string): Promise<BottleMetadataPayload[]> {
    if (!existsSync(prefixRoot)) {
      return [];
    }

    try {
      const rootBottle = await this.readPrefixBottleCandidate(prefixRoot, path.basename(prefixRoot));
      const entries = await readdir(prefixRoot, { withFileTypes: true });
      const bottles = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory() && !is_internal_bottle_prefix_dir_name(entry.name))
          .map((entry) => this.readPrefixBottleCandidate(path.join(prefixRoot, entry.name), entry.name)),
      );

      return merge_bottles([], [rootBottle, ...bottles].filter((bottle): bottle is BottleMetadataPayload => Boolean(bottle)));
    } catch {
      return [];
    }
  }

  private async readPrefixBottleCandidate(bottlePath: string, fallbackName: string): Promise<BottleMetadataPayload | null> {
    // Prefer launcher metadata when it exists. If not, a folder with normal Wine
    // prefix markers is promoted into a scanned bottle and gets metadata written
    // back for future launches.
    const metadataPath = path.join(bottlePath, "bdih-bottle.json");

    try {
      if (existsSync(metadataPath)) {
        const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as unknown;
        const normalized = normalize_bottle(metadata, bottlePath);

        if (normalized) {
          return normalized;
        }
      }

      if (!is_bottle_prefix_path(bottlePath)) {
        return null;
      }

      const stats = await stat(bottlePath);
      const scannedBottle = create_scanned_bottle(fallbackName, bottlePath, stats.birthtime.toISOString());
      await write_prefix_metadata(scannedBottle);
      return scannedBottle;
    } catch {
      if (!is_bottle_prefix_path(bottlePath)) {
        return null;
      }

      const createdAt = await safe_bottle_created_at(bottlePath);
      const scannedBottle = create_scanned_bottle(fallbackName, bottlePath, createdAt);
      await write_prefix_metadata(scannedBottle);
      return scannedBottle;
    }
  }
}

function parse_registry_state(raw: string): BottleRegistryState {
  const parsed = JSON.parse(raw) as unknown;
  const candidate = is_record(parsed) && Array.isArray(parsed.bottles)
      ? parsed.bottles
      : Array.isArray(parsed)
        ? parsed
        : [];
  const deletedBottleKeys = is_record(parsed)
    ? normalize_deleted_bottle_keys([
        ...array_of_strings(parsed.deletedBottleKeys),
        ...array_of_strings(parsed.deletedBottleIds).map((id) => `id:${id}`),
        ...array_of_strings(parsed.deletedBottlePaths).map((targetPath) => bottle_path_key(targetPath)),
      ])
    : [];

  return {
    bottles: normalize_bottle_array(candidate),
    deletedBottleKeys,
  };
}

function merge_registry_states(states: BottleRegistryState[]): BottleRegistryState {
  return {
    bottles: states.reduceRight<BottleMetadataPayload[]>(
      (mergedBottles, state) => merge_bottles(state.bottles, mergedBottles),
      [],
    ),
    deletedBottleKeys: normalize_deleted_bottle_keys(states.flatMap((state) => state.deletedBottleKeys)),
  };
}

function normalize_bottle_array(value: unknown): BottleMetadataPayload[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return assign_missing_bottle_icon_ids(
    value
      .map((item) => normalize_bottle(item))
      .filter((bottle): bottle is BottleMetadataPayload => Boolean(bottle)),
  );
}

async function rename_incoming_bottle_directories(
  incomingBottles: BottleMetadataPayload[],
  registryBottles: BottleMetadataPayload[],
): Promise<BottleMetadataPayload[]> {
  const registryBottleById = new Map(registryBottles.map((bottle) => [bottle.id, bottle]));

  return Promise.all(incomingBottles.map(async (bottle) => {
    const previousBottle = registryBottleById.get(bottle.id);

    if (!previousBottle || previousBottle.name.trim() === bottle.name.trim()) {
      return bottle;
    }

    return rename_bottle_directory_for_name(bottle, previousBottle);
  }));
}

async function rename_bottle_directory_for_name(
  bottle: BottleMetadataPayload,
  previousBottle: BottleMetadataPayload,
): Promise<BottleMetadataPayload> {
  const sourcePath = path.resolve(expand_user_home_path(previousBottle.path || bottle.path));
  const parentPath = path.dirname(sourcePath);
  const nextPath = path.resolve(parentPath, bottle_name_to_slug(bottle.name));

  logManager.renameBottleLogs({
    bottleId: bottle.id,
    previousBottleName: previousBottle.name,
    nextBottleName: bottle.name,
  });

  if (sourcePath === nextPath) {
    return {
      ...bottle,
      path: sourcePath,
      prefixPath: parentPath,
      updatedAt: new Date().toISOString(),
    };
  }

  if (path.dirname(nextPath) !== parentPath || !existsSync(sourcePath)) {
    return bottle;
  }

  if (existsSync(nextPath)) {
    if (sourcePath.toLowerCase() !== nextPath.toLowerCase()) {
      return bottle;
    }

    const temporaryPath = path.join(parentPath, `.bdih-rename-${Date.now()}-${path.basename(sourcePath)}`);

    await rename(sourcePath, temporaryPath);
    await rename(temporaryPath, nextPath);
  } else {
    await rename(sourcePath, nextPath);
  }

  return {
    ...bottle,
    path: nextPath,
    prefixPath: parentPath,
    updatedAt: new Date().toISOString(),
  };
}

function normalize_bottle(value: unknown, fallbackPath = ""): BottleMetadataPayload | null {
  if (!is_record(value)) {
    return null;
  }

  const id = string_or_default(value.id, string_or_default(value.bottleId, ""));
  const name = string_or_default(value.name, string_or_default(value.bottleName, path.basename(fallbackPath)));
  const bottlePath = string_or_default(value.path, string_or_default(value.bottlePath, fallbackPath));
  const normalizedBottlePath = normalize_host_path(bottlePath);
  const normalizedPrefixPath = optional_string(value.prefixPath)
    ? normalize_host_path(string_or_default(value.prefixPath, ""))
    : path.dirname(normalizedBottlePath);
  const createdAt = string_or_default(value.createdAt, string_or_default(value.updatedAt, new Date().toISOString()));

  if (!id || !name || !bottlePath) {
    return null;
  }

  return {
    id,
    bottleIconId: is_bottle_icon_id(value.bottleIconId) ? value.bottleIconId : undefined,
    name,
    description: string_or_default(value.description, name),
    wineVersionId: string_or_default(value.wineVersionId, ""),
    wineRuntimePath: normalize_optional_host_path(value.wineRuntimePath),
    dxmtVersionId: optional_string(value.dxmtVersionId),
    dxmtPackagePath: normalize_optional_host_path(value.dxmtPackagePath),
    jadeiteVersionId: optional_string(value.jadeiteVersionId),
    path: normalizedBottlePath,
    prefixPath: normalizedPrefixPath,
    status: bottle_status_or_default(value.status, "ready"),
    setupTask: is_record(value.setupTask) ? {
      stage: bottle_task_stage_or_default(value.setupTask.stage),
      progress: number_or_default(value.setupTask.progress, 100),
      message: optional_string(value.setupTask.message),
    } : undefined,
    launcherTasks: is_record(value.launcherTasks) ? value.launcherTasks as BottleMetadataPayload["launcherTasks"] : undefined,
    loggingLevelOverride: is_launcher_log_level(value.loggingLevelOverride) ? value.loggingLevelOverride : undefined,
    wineDebugArgsOverride: optional_string(value.wineDebugArgsOverride),
    prefixes: normalize_bottle_prefixes(value.prefixes),
    hiddenAppIds: [...new Set(array_of_strings(value.hiddenAppIds).map(canonical_bottle_app_id))],
    apps: normalize_apps(value.apps),
    createdAt,
    updatedAt: string_or_default(value.updatedAt, createdAt),
  };
}

function normalize_bottle_prefixes(value: unknown): BottlePrefixMetadataPayload[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const prefixes = value
    .filter(is_record)
    .map((prefix): BottlePrefixMetadataPayload | null => {
      const id = string_or_default(prefix.id, "");
      const name = string_or_default(prefix.name, "");
      const prefixPath = string_or_default(prefix.path, "");

      if (!id || !name || !prefixPath) {
        return null;
      }

      return {
        id,
        name,
        path: normalize_host_path(prefixPath),
        kind: prefix.kind === "preset" ? "preset" : "custom",
        presetId: bottle_prefix_preset_id_or_undefined(prefix.presetId),
        createdAt: optional_string(prefix.createdAt),
        updatedAt: optional_string(prefix.updatedAt),
      };
    })
    .filter((prefix): prefix is BottlePrefixMetadataPayload => Boolean(prefix));

  return prefixes.length > 0 ? prefixes : undefined;
}

function bottle_prefix_preset_id_or_undefined(value: unknown): BottlePrefixMetadataPayload["presetId"] {
  if (
    value === "default" ||
    value === "steam" ||
    value === "hoyoplay" ||
    value === "zzz" ||
    value === "hsr" ||
    value === "genshin"
  ) {
    return value;
  }

  return undefined;
}

function deleted_keys_without_incoming_bottles(
  existingDeletedBottleKeys: string[],
  incomingBottles: BottleMetadataPayload[],
): string[] {
  const deletedBottleKeys = new Set(normalize_deleted_bottle_keys(existingDeletedBottleKeys));
  const incomingBottleKeys = new Set(incomingBottles.flatMap(bottle_identity_keys));

  for (const key of incomingBottleKeys) {
    deletedBottleKeys.delete(key);
  }

  return normalize_deleted_bottle_keys([...deletedBottleKeys]);
}

function is_deleted_bottle(
  bottle: BottleMetadataPayload,
  deletedBottleKeys: Set<string>,
): boolean {
  return bottle_has_any_identity_key(bottle, deletedBottleKeys);
}

function bottle_has_any_identity_key(
  bottle: BottleMetadataPayload,
  keys: Set<string>,
): boolean {
  return bottle_identity_keys(bottle).some((key) => keys.has(key));
}

function find_bottle_by_identity(
  bottles: BottleMetadataPayload[],
  bottleId: string,
  bottlePath: string,
): BottleMetadataPayload | undefined {
  return bottles.find((bottle) => bottle_matches_identity(bottle, bottleId, bottlePath));
}

function bottle_matches_identity(
  bottle: BottleMetadataPayload,
  bottleId: string,
  bottlePath: string,
): boolean {
  return bottle.id === bottleId ||
    path.resolve(expand_user_home_path(bottle.path)) === path.resolve(expand_user_home_path(bottlePath));
}

function bottle_identity_keys(bottle: BottleMetadataPayload): string[] {
  return [
    bottle.id ? `id:${bottle.id}` : "",
    bottle.path ? bottle_path_key(bottle.path) : "",
  ].filter(Boolean);
}

function bottle_path_key(targetPath: string): string {
  return `path:${path.resolve(expand_user_home_path(targetPath))}`;
}

function normalize_deleted_bottle_keys(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right));
}

function array_of_strings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function is_safe_bottle_delete_path(targetPath: string): boolean {
  const parsed = path.parse(targetPath);
  const homePath = process.env.HOME ? path.resolve(process.env.HOME) : "";

  if (!targetPath || targetPath === parsed.root || targetPath === homePath) {
    return false;
  }

  return path.basename(targetPath).trim().length > 0;
}

function normalize_apps(value: unknown): InstalledBottleAppPayload[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(is_record)
    .map((app): InstalledBottleAppPayload | null => {
      const rawId = string_or_default(app.id, "");
      const name = string_or_default(app.name, "");
      const wineVersionId = string_or_default(app.wineVersionId, "");
      const executablePath = optional_string(app.executablePath);
      const prefixPath = optional_string(app.prefixPath);
      const id = canonical_bottle_app_id(rawId);
      const steamAppId = optional_string(app.steamAppId);
      const executableArgs = Array.isArray(app.executableArgs)
        ? app.executableArgs.filter((arg): arg is string => typeof arg === "string" && arg.trim().length > 0)
        : [];

      if (!id || !name || !wineVersionId || is_launcher_installer_app(id, name, executablePath)) {
        return null;
      }

      return {
        id,
        name,
        subtitle: string_or_default(app.subtitle, name),
        wineVersionId,
        executablePath,
        prefixPath: prefixPath ? normalize_host_path(prefixPath) : undefined,
        executableArgs: executableArgs.length > 0
          ? executableArgs
          : steamAppId
            ? steam_game_launch_args(steamAppId)
            : undefined,
        launchOptions: normalize_launch_options(
          is_record(app.launchOptions) ? app.launchOptions : undefined,
        ),
        iconSrc: optional_string(app.iconSrc),
        source: app_source_or_default(app.source),
        steamAppId,
        steamManifestPath: normalize_optional_host_path(app.steamManifestPath),
        steamManifestMissingChecks: Math.max(0, Math.floor(number_or_default(app.steamManifestMissingChecks, 0))) || undefined,
        steamLaunchConfirmedAt: optional_string(app.steamLaunchConfirmedAt),
        lastPlayed: string_or_default(app.lastPlayed, "Never launched"),
        lastPlayedKey: optional_string(app.lastPlayedKey),
        status: app_status_or_default(app.status),
        launchError: optional_string(app.launchError),
      };
    })
    .filter((app): app is InstalledBottleAppPayload => Boolean(app));
}

function canonical_bottle_app_id(id: string): string {
  if (id === "hoyo:starrail") {
    return "hoyo:hsr";
  }

  return id;
}

function merge_bottles(
  registryBottles: BottleMetadataPayload[],
  scannedBottles: BottleMetadataPayload[],
): BottleMetadataPayload[] {
  const scannedByIdentity = new Map<string, BottleMetadataPayload>();
  const usedScannedBottleKeys = new Set<string>();

  for (const bottle of scannedBottles) {
    scannedByIdentity.set(bottle.id, bottle);
    scannedByIdentity.set(bottle_path_key(bottle.path), bottle);
  }

  const mergedBottles = registryBottles.map((bottle) => {
    const previous = scannedByIdentity.get(bottle.id) ?? scannedByIdentity.get(bottle_path_key(bottle.path));
    const next = previous ? {
      ...previous,
      ...bottle,
      apps: reorder_apps_by_preferred_ids(
        // `bottle` is the authoritative registry/renderer record while
        // `previous` is supplemental prefix-scan data. merge_apps preserves
        // user-owned state such as launchOptions from its first argument.
        merge_apps(bottle.apps, previous.apps),
        bottle.apps.map((app) => app.id),
      ),
    } : bottle;

    if (previous) {
      usedScannedBottleKeys.add(previous.id);
      usedScannedBottleKeys.add(bottle_path_key(previous.path));
    }

    return next;
  });

  for (const bottle of scannedBottles) {
    if (usedScannedBottleKeys.has(bottle.id) || usedScannedBottleKeys.has(bottle_path_key(bottle.path))) {
      continue;
    }

    mergedBottles.push(bottle);
  }

  return mergedBottles;
}

function create_scanned_bottle(name: string, bottlePath: string, createdAt: string): BottleMetadataPayload {
  return {
    id: `scanned:${bottlePath}`,
    name,
    description: name,
    wineVersionId: "",
    path: bottlePath,
    prefixPath: path.dirname(bottlePath),
    status: is_bottle_prefix_path(bottlePath) ? "ready" : "needs-setup",
    apps: [],
    createdAt,
    updatedAt: createdAt,
  };
}

function is_bottle_prefix_path(bottlePath: string): boolean {
  return existsSync(path.join(bottlePath, "bdih-bottle.json"))
    || is_wine_prefix_path(bottlePath);
}

function is_wine_prefix_path(bottlePath: string): boolean {
  return existsSync(path.join(bottlePath, "system.reg"))
    || existsSync(path.join(bottlePath, "user.reg"))
    || existsSync(path.join(bottlePath, "drive_c"));
}

const BOTTLE_PREFIX_SCAN_MAX_DEPTH = 3;
const BOTTLE_PREFIX_SCAN_IGNORED_DIRECTORIES = new Set([
  ".cache",
  ".snapshots",
  "dosdevices",
  "drive_c",
  "logs",
  "snapshots",
]);

function discovered_prefix_metadata(prefixPath: string): BottlePrefixMetadataPayload {
  const directoryName = path.basename(prefixPath);
  const knownPrefix = new Map<string, { name: string; presetId: string }>([
    ["wine-prefix", { name: "Default Wine", presetId: "default" }],
    ["steam-prefix", { name: "Steam", presetId: "steam" }],
    ["hoyo-prefix", { name: "HoYoPlay", presetId: "hoyoplay" }],
    ["genshin-prefix", { name: "Genshin Impact", presetId: "genshin" }],
    ["hsr-prefix", { name: "Honkai: Star Rail", presetId: "hsr" }],
    ["zzz-prefix", { name: "Zenless Zone Zero", presetId: "zzz" }],
  ]).get(directoryName.toLowerCase());

  return {
    id: `discovered:${prefixPath}`,
    name: knownPrefix?.name ?? directoryName,
    path: prefixPath,
    kind: knownPrefix ? "preset" : "custom",
    presetId: knownPrefix?.presetId,
    createdAt: new Date().toISOString(),
  };
}

async function enrich_bottle_prefixes_from_disk(
  bottle: BottleMetadataPayload,
): Promise<BottleMetadataPayload> {
  const prefixesByPath = new Map<string, BottlePrefixMetadataPayload>();
  const rememberPrefix = (prefix: BottlePrefixMetadataPayload) => {
    const expandedPath = path.resolve(expand_user_home_path(prefix.path));
    prefixesByPath.set(expandedPath, {
      ...prefix,
      path: expandedPath,
    });
  };

  for (const prefix of bottle.prefixes ?? []) {
    rememberPrefix(prefix);
  }

  for (const app of bottle.apps) {
    const prefixPath = optional_string(app.prefixPath);
    if (prefixPath) {
      const expandedPath = path.resolve(expand_user_home_path(prefixPath));
      if (is_wine_prefix_path(expandedPath) && !prefixesByPath.has(expandedPath)) {
        rememberPrefix({
          ...discovered_prefix_metadata(expandedPath),
          name: app.name,
        });
      }
    }
  }

  const bottlePath = path.resolve(expand_user_home_path(bottle.path));
  const directories: Array<{ directoryPath: string; depth: number }> = [{
    directoryPath: bottlePath,
    depth: 0,
  }];

  while (directories.length > 0) {
    const current = directories.shift();
    if (!current) break;

    let entries: Dirent[];
    try {
      entries = await readdir(current.directoryPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (BOTTLE_PREFIX_SCAN_IGNORED_DIRECTORIES.has(entry.name.toLowerCase())) continue;

      const candidatePath = path.join(current.directoryPath, entry.name);
      if (is_wine_prefix_path(candidatePath)) {
        if (!prefixesByPath.has(candidatePath)) {
          rememberPrefix(discovered_prefix_metadata(candidatePath));
        }
        continue;
      }

      if (current.depth < BOTTLE_PREFIX_SCAN_MAX_DEPTH) {
        directories.push({ directoryPath: candidatePath, depth: current.depth + 1 });
      }
    }
  }

  return {
    ...bottle,
    prefixes: [...prefixesByPath.values()],
  };
}

function primary_launcher_prefix_path(bottlePath: string, launcher: BottleLauncherKind): string {
  return create_launcher_prefix_path(expand_user_home_path(bottlePath), launcher);
}

function launcher_prefix_candidates(bottlePath: string, launcher: BottleLauncherKind): string[] {
  const expandedBottlePath = expand_user_home_path(bottlePath);
  const candidates = [
    primary_launcher_prefix_path(expandedBottlePath, launcher),
    is_wine_prefix_path(expandedBottlePath) ? expandedBottlePath : undefined,
  ];

  return unique_paths(candidates.filter((candidate): candidate is string => Boolean(candidate)));
}

function bottle_app_prefix_candidates(
  bottlePath: string,
  app: Pick<InstalledBottleAppPayload, "id" | "name" | "source" | "executablePath" | "prefixPath">,
): string[] {
  if (app.prefixPath?.trim()) {
    return unique_paths([expand_user_home_path(app.prefixPath)]);
  }

  const hoyoGame = hoyo_game_from_bottle_app(app);
  const launcher = launcher_from_bottle_app(app);
  const expandedBottlePath = expand_user_home_path(bottlePath);

  if (hoyoGame) {
    return unique_paths([
      create_hoyo_game_prefix_path(expandedBottlePath, hoyoGame),
      ...launcher_prefix_candidates(expandedBottlePath, "hoyoplay"),
    ]);
  }

  if (launcher) {
    return launcher_prefix_candidates(expandedBottlePath, launcher);
  }

  return unique_paths([
    create_default_wine_prefix_path(expandedBottlePath),
    path.join(expandedBottlePath, "manual-prefix"),
    is_wine_prefix_path(expandedBottlePath) ? expandedBottlePath : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate)));
}

async function safe_bottle_created_at(bottlePath: string): Promise<string> {
  try {
    return (await stat(bottlePath)).birthtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

async function enrich_bottle_apps_from_prefix(bottle: BottleMetadataPayload): Promise<BottleMetadataPayload> {
  const hiddenAppIds = new Set(bottle.hiddenAppIds ?? []);
  const detectedApps = (await detect_installed_apps(bottle)).filter((app) => !hiddenAppIds.has(app.id));
  const existingApps = prune_unavailable_apps(bottle).filter((app) => !hiddenAppIds.has(app.id));
  const mergedApps = merge_apps(existingApps, detectedApps);
  const { apps, changed: iconsChanged } = await enrich_apps_with_executable_icons(bottle, mergedApps);
  const launcherTasks = merge_launcher_download_tasks(
    bottle.launcherTasks,
    detect_downloaded_launcher_tasks(bottle, apps),
  );

  if (
    detectedApps.length === 0 &&
    existingApps.length === bottle.apps.length &&
    !iconsChanged &&
    launcherTasks === bottle.launcherTasks
  ) {
    return bottle;
  }

  return {
    ...bottle,
    apps,
    launcherTasks,
    updatedAt: new Date().toISOString(),
  };
}

function detect_downloaded_launcher_tasks(
  bottle: BottleMetadataPayload,
  apps: InstalledBottleAppPayload[],
): BottleMetadataPayload["launcherTasks"] {
  const tasks: BottleMetadataPayload["launcherTasks"] = {};

  if (
    !apps.some((app) => app.id === "steam") &&
    is_launcher_installer_downloaded(bottle.path, "steam", "SteamSetup.exe")
  ) {
    tasks.steam = {
      stage: "downloaded",
      progress: 100,
      message: "Steam installer is downloaded.",
    };
  }

  if (
    !apps.some((app) => app.id === "hoyoplay") &&
    is_launcher_installer_downloaded(bottle.path, "hoyoplay", "HoYoPlaySetup.exe")
  ) {
    tasks.hoyoplay = {
      stage: "downloaded",
      progress: 100,
      message: "HoYoPlay installer is downloaded.",
    };
  }

  return Object.keys(tasks).length > 0 ? tasks : undefined;
}

function is_launcher_installer_downloaded(
  bottlePath: string,
  launcher: BottleLauncherKind,
  fileName: string,
): boolean {
  const expandedBottlePath = expand_user_home_path(bottlePath);
  const cacheInstallerPath = path.join(expandedBottlePath, ".cache", "installers", launcher, fileName);

  return existsSync(cacheInstallerPath) ||
    launcher_prefix_candidates(expandedBottlePath, launcher).some((prefixPath) =>
      existsSync(path.join(prefixPath, "_bdih_installers", fileName)),
    );
}

function merge_launcher_download_tasks(
  currentTasks: BottleMetadataPayload["launcherTasks"],
  downloadedTasks: BottleMetadataPayload["launcherTasks"],
): BottleMetadataPayload["launcherTasks"] {
  if (!downloadedTasks) {
    return currentTasks;
  }

  const nextTasks: BottleMetadataPayload["launcherTasks"] = { ...currentTasks };
  let changed = false;

  for (const launcher of Object.keys(downloadedTasks) as BottleLauncherKind[]) {
    const currentTask = nextTasks[launcher];
    const downloadedTask = downloadedTasks[launcher];

    if (currentTask && currentTask.stage !== "ready") {
      continue;
    }

    if (
      currentTask?.stage === downloadedTask?.stage &&
      currentTask?.progress === downloadedTask?.progress &&
      currentTask?.message === downloadedTask?.message
    ) {
      continue;
    }

    nextTasks[launcher] = downloadedTask;
    changed = true;
  }

  return changed ? nextTasks : currentTasks;
}

async function enrich_apps_with_executable_icons(
  bottle: BottleMetadataPayload,
  apps: InstalledBottleAppPayload[],
): Promise<{ apps: InstalledBottleAppPayload[]; changed: boolean }> {
  let changed = false;
  const enrichedApps = await Promise.all(apps.map(async (app) => {
    if (app.iconSrc) {
      return app;
    }

    if (app.source === "steam" && app.steamAppId) {
      return app;
    }

    const executablePath = host_paths_from_app_executable(bottle.path, app).find((candidate) => existsSync(candidate));
    const iconSrc = await iconManager.extractExecutableIcon(executablePath, bottle_icon_cache_path(bottle.path));

    if (!iconSrc) {
      return app;
    }

    changed = true;
    return {
      ...app,
      iconSrc,
    };
  }));

  return {
    apps: enrichedApps,
    changed,
  };
}

function prune_unavailable_apps(bottle: BottleMetadataPayload): InstalledBottleAppPayload[] {
  return bottle.apps.flatMap((app) => {
    if (
      is_unavailable_launcher_app(bottle, app) ||
      is_unavailable_hoyo_game_app(bottle, app) ||
      is_unavailable_manual_app(bottle, app)
    ) {
      return [];
    }

    const reconciledSteamApp = reconcile_steam_manifest_availability(app);
    return reconciledSteamApp ? [reconciledSteamApp] : [];
  });
}

function reconcile_steam_manifest_availability(
  app: InstalledBottleAppPayload,
): InstalledBottleAppPayload | null {
  if (app.source !== "steam" || !app.steamAppId || !app.steamManifestPath) {
    return app;
  }

  // Older builds eagerly registered every manifest visible through G:. Those
  // entries have no process-backed confirmation and should disappear until
  // Steam actually launches the matching AppID.
  if (!app.steamLaunchConfirmedAt) {
    return null;
  }

  const manifestPath = path.resolve(expand_user_home_path(app.steamManifestPath));

  if (existsSync(manifestPath)) {
    if (!app.steamManifestMissingChecks) {
      return app;
    }

    const { steamManifestMissingChecks: _missingChecks, ...availableApp } = app;
    return availableApp;
  }

  // A disconnected shared/external Steam library must not look like an
  // uninstall. Only count a miss while the manifest directory is accessible.
  if (!existsSync(path.dirname(manifestPath))) {
    return app;
  }

  const missingChecks = (app.steamManifestMissingChecks ?? 0) + 1;

  if (missingChecks >= 2) {
    return null;
  }

  return {
    ...app,
    steamManifestPath: manifestPath,
    steamManifestMissingChecks: missingChecks,
  };
}

function is_unavailable_manual_app(
  bottle: BottleMetadataPayload,
  app: InstalledBottleAppPayload,
): boolean {
  if (app.source !== "manual") {
    return false;
  }

  const executablePaths = host_paths_from_app_executable(bottle.path, app);
  return executablePaths.length === 0 || executablePaths.every((candidate) => !existsSync(candidate));
}

function is_unavailable_launcher_app(
  bottle: BottleMetadataPayload,
  app: InstalledBottleAppPayload,
): boolean {
  if (is_launcher_installer_app(app.id, app.name, app.executablePath)) {
    return true;
  }

  if (app.id === "steam") {
    return !host_paths_from_app_executable(bottle.path, app).some((candidate) => existsSync(candidate));
  }

  if (app.id === "hoyoplay") {
    return !host_paths_from_app_executable(bottle.path, app).some((candidate) => existsSync(candidate));
  }

  return false;
}

function is_unavailable_hoyo_game_app(
  bottle: BottleMetadataPayload,
  app: InstalledBottleAppPayload,
): boolean {
  if (!app.id.startsWith("hoyo:") && app.source !== "game") {
    return false;
  }

  const game = hoyo_catalog_entry_from_app(app);

  if (!game) {
    return false;
  }

  const executablePaths = host_paths_from_app_executable(bottle.path, app).filter((candidate) => existsSync(candidate));

  if (executablePaths.length === 0) {
    return true;
  }

  return executablePaths.every((executablePath) =>
    HOYO_EXCLUDED_EXE_PATTERN.test(path.basename(executablePath)) ||
    !is_known_hoyo_game_executable(executablePath, game),
  );
}

function is_launcher_installer_app(id: string, name: string, executablePath?: string): boolean {
  const searchable = `${id} ${name} ${executablePath ?? ""}`.toLowerCase().replace(/\\/g, "/").trim();

  return /(^|[/\s_-])steamsetup\.exe$/i.test(searchable)
    || /(^|[/\s_-])hoyoplay.*setup.*\.exe$/i.test(searchable)
    || /(^|[/\s_-])hoyoplay.*installer.*\.exe$/i.test(searchable);
}

async function detect_installed_apps(bottle: BottleMetadataPayload): Promise<InstalledBottleAppPayload[]> {
  const apps: InstalledBottleAppPayload[] = [];
  const steamInstall = await detect_steam_install(bottle);

  if (steamInstall) {
    apps.push(steamInstall.app);
  }

  const hoyoplayInstall = await detect_hoyoplay_install(bottle);

  if (hoyoplayInstall) {
    apps.push(hoyoplayInstall);
  }

  apps.push(...await detect_hoyo_games(bottle));

  return apps;
}

async function detect_steam_install(
  bottle: BottleMetadataPayload,
): Promise<SteamInstallDetection | null> {
  const detected = await find_launcher_profile_executable(bottle.path, "steam");

  if (!detected) {
    return null;
  }

  return {
    steamRootPath: path.dirname(detected.executablePath),
    prefixPath: detected.prefixPath,
    app: {
      id: "steam",
      name: "Steam",
      subtitle: "Windows game launcher",
      wineVersionId: bottle.wineVersionId,
      executablePath: windows_path_from_host(detected.prefixPath, detected.executablePath),
      prefixPath: detected.prefixPath,
      iconSrc: await iconManager.extractExecutableIcon(detected.executablePath, bottle_icon_cache_path(bottle.path)) ?? STEAM_ICON_URL,
      source: "launcher",
      launchOptions: { presetId: "steam" },
      lastPlayed: "Never launched",
      lastPlayedKey: "main.lastPlayed.never",
      status: "ready",
    },
  };
}

async function detect_hoyoplay_install(bottle: BottleMetadataPayload): Promise<InstalledBottleAppPayload | null> {
  const detected = await find_launcher_profile_executable(bottle.path, "hoyoplay");

  if (!detected) {
    return null;
  }

  return {
    id: "hoyoplay",
    name: "HoYoPlay",
    subtitle: "HoYoverse game launcher",
    wineVersionId: bottle.wineVersionId,
    executablePath: windows_path_from_drive_c(detected.prefixPath, detected.executablePath),
    prefixPath: detected.prefixPath,
    iconSrc: await iconManager.extractExecutableIcon(detected.executablePath, bottle_icon_cache_path(bottle.path)) ?? HOYOPLAY_ICON_URL,
    source: "launcher",
    launchOptions: { presetId: "hoyoplay" },
    lastPlayed: "Never launched",
    lastPlayedKey: "main.lastPlayed.never",
    status: "ready",
  };
}

async function detect_hoyo_games(bottle: BottleMetadataPayload): Promise<InstalledBottleAppPayload[]> {
  const candidates = await find_hoyo_game_executables(bottle.path);

  return Promise.all(
    candidates.map(async ({ game, executablePath, prefixPath }) => {
      const gameKind = hoyo_game_kind_from_catalog_entry(game);

      return {
        id: `hoyo:${gameKind}`,
        name: game.name,
        subtitle: "HoYoverse game",
        wineVersionId: bottle.wineVersionId,
        executablePath: windows_path_from_host(prefixPath, executablePath),
        prefixPath,
        iconSrc: await iconManager.extractExecutableIcon(executablePath, bottle_icon_cache_path(bottle.path)),
        source: "game" as const,
        launchOptions: { presetId: gameKind },
        lastPlayed: "Never launched",
        lastPlayedKey: "main.lastPlayed.never",
        status: "ready" as const,
      };
    }),
  );
}

async function find_hoyo_game_executables(
  bottlePath: string,
): Promise<Array<{ game: HoYoGameCatalogEntry; executablePath: string; prefixPath: string }>> {
  const expandedBottlePath = expand_user_home_path(bottlePath);
  const roots = unique_paths([
    ...launcher_prefix_candidates(expandedBottlePath, "hoyoplay"),
    create_hoyo_game_prefix_path(expandedBottlePath, "zzz"),
    create_hoyo_game_prefix_path(expandedBottlePath, "hsr"),
    create_hoyo_game_prefix_path(expandedBottlePath, "genshin"),
  ]);
  const scannedExecutables: Array<{ executablePath: string; prefixPath: string; scanRootPath: string }> = [];
  const scanJobs = unique_scan_jobs([
    ...roots.flatMap((prefixPath) => {
      const driveCPath = path.join(prefixPath, "drive_c");

      return [driveCPath, prefixPath]
        .filter((rootPath) => existsSync(rootPath))
        .map((rootPath) => ({ prefixPath, rootPath }));
    }),
  ]);
  let visitedEntries = 0;

  for (const { prefixPath, rootPath } of scanJobs) {
    await collect_executable_candidates(rootPath, 0, scannedExecutables, () => {
      visitedEntries += 1;
      return visitedEntries <= HOYO_EXE_SCAN_MAX_ENTRIES;
    }, prefixPath, rootPath);
  }

  const bestByGame = new Map<string, { game: HoYoGameCatalogEntry; executablePath: string; prefixPath: string; score: number }>();

  for (const { executablePath, prefixPath, scanRootPath } of scannedExecutables) {
    if (HOYO_EXCLUDED_EXE_PATTERN.test(path.basename(executablePath))) {
      continue;
    }

    for (const game of HOYO_GAME_CATALOG) {
      const score = score_hoyo_executable_candidate(executablePath, scanRootPath, game);

      if (score <= 0) {
        continue;
      }

      const current = bestByGame.get(game.id);

      if (!current || score > current.score) {
        bestByGame.set(game.id, {
          game,
          executablePath,
          prefixPath: create_hoyo_game_prefix_path(expandedBottlePath, hoyo_game_kind_from_catalog_entry(game)),
          score,
        });
      }
    }
  }

  return [...bestByGame.values()]
    .sort((left, right) => right.score - left.score)
    .map(({ game, executablePath, prefixPath }) => ({ game, executablePath, prefixPath }));
}

async function collect_executable_candidates(
  currentPath: string,
  depth: number,
  candidates: Array<{ executablePath: string; prefixPath: string; scanRootPath: string }>,
  shouldContinue: () => boolean,
  prefixPath: string,
  scanRootPath: string,
): Promise<void> {
  if (depth > HOYO_EXE_SCAN_MAX_DEPTH || !shouldContinue()) {
    return;
  }

  let entries: Dirent[];

  try {
    entries = await readdir(currentPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!shouldContinue()) {
      return;
    }

    const entryPath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      if (!HOYO_SCAN_SKIP_DIRECTORY_PATTERN.test(entry.name)) {
        await collect_executable_candidates(entryPath, depth + 1, candidates, shouldContinue, prefixPath, scanRootPath);
      }
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".exe")) {
      candidates.push({ executablePath: entryPath, prefixPath, scanRootPath });
    }
  }
}

function score_hoyo_executable_candidate(executablePath: string, scanRootPath: string, game: HoYoGameCatalogEntry): number {
  const executableName = path.basename(executablePath).toLowerCase();
  const relativeSearchPath = path.relative(scanRootPath, executablePath);
  const normalizedPath = normalize_search_token(relativeSearchPath);
  const exactExecutableNames = game.executableNames.map((name) => name.toLowerCase());
  let score = exactExecutableNames.includes(executableName) ? 10_000 : 0;

  for (const token of game.pathTokens) {
    const normalizedToken = normalize_search_token(token);

    if (normalizedPath.includes(normalizedToken)) {
      score += 250;
    }
  }

  if (score === 0) {
    return 0;
  }

  if (executableName.includes("launcher")) {
    score -= 200;
  }

  return score;
}

function hoyo_catalog_entry_from_app(
  app: Pick<InstalledBottleAppPayload, "id" | "source" | "executablePath" | "name">,
): HoYoGameCatalogEntry | undefined {
  const gameKind = hoyo_game_from_bottle_app(app);

  if (!gameKind) {
    return undefined;
  }

  const catalogId = gameKind === "hsr" ? "starrail" : gameKind;
  return HOYO_GAME_CATALOG.find((entry) => entry.id === catalogId);
}

function is_known_hoyo_game_executable(executablePath: string, game: HoYoGameCatalogEntry): boolean {
  const executableName = path.basename(executablePath).toLowerCase();

  return game.executableNames.some((knownName) => knownName.toLowerCase() === executableName);
}

function hoyo_game_kind_from_catalog_entry(game: HoYoGameCatalogEntry): "zzz" | "hsr" | "genshin" {
  if (game.id === "starrail") {
    return "hsr";
  }

  return game.id;
}

async function find_launcher_profile_executable(
  bottlePath: string,
  launcher: BottleLauncherKind,
): Promise<{ prefixPath: string; executablePath: string } | undefined> {
  const profile = get_launcher_runtime_profile(launcher);

  if (!profile) {
    return undefined;
  }

  for (const prefixPath of launcher_prefix_candidates(bottlePath, launcher)) {
    const executablePath = await find_runtime_profile_executable(prefixPath, profile);

    if (executablePath) {
      return { prefixPath, executablePath };
    }
  }

  return undefined;
}

async function detect_launched_steam_game(
  bottle: BottleMetadataPayload,
  steamInstall: SteamInstallDetection,
  steamAppId: string,
): Promise<InstalledBottleAppPayload | null> {
  const steamAppsPaths = await find_steam_library_steamapps_paths(steamInstall);
  const manifestName = `appmanifest_${steamAppId}.acf`;

  for (const steamAppsPath of steamAppsPaths) {
    const manifestPath = path.join(steamAppsPath, manifestName);

    try {
      const app = await steam_app_from_manifest(
        bottle,
        steamInstall,
        manifestPath,
        await readFile(manifestPath, "utf8"),
      );

      if (app?.steamAppId === steamAppId) {
        return app;
      }
    } catch {
      // Try the next Steam library registered for this prefix.
    }
  }

  return null;
}

async function find_steam_library_steamapps_paths(
  steamInstall: SteamInstallDetection,
): Promise<string[]> {
  const primarySteamAppsPath = path.join(steamInstall.steamRootPath, "steamapps");
  const libraryRoots: string[] = [steamInstall.steamRootPath];
  const sharedDriveRoot = wine_drive_host_root(steamInstall.prefixPath, "g:");

  if (sharedDriveRoot) {
    libraryRoots.push(sharedDriveRoot, path.join(sharedDriveRoot, "SteamLibrary"));
  }

  try {
    const libraryFolders = await readFile(
      path.join(primarySteamAppsPath, "libraryfolders.vdf"),
      "utf8",
    );

    for (const libraryPath of steam_library_paths_from_vdf(libraryFolders)) {
      const hostPath = host_path_from_app_executable(
        steamInstall.prefixPath,
        libraryPath,
      );

      if (hostPath) {
        libraryRoots.push(hostPath);
      }
    }
  } catch {
    // A launch event can arrive while Steam is still writing libraryfolders.vdf.
    // The targeted AppID lookup below may still use primary/conventional G:.
  }

  return unique_paths(
    libraryRoots.map((libraryRoot) =>
      path.basename(libraryRoot).toLowerCase() === "steamapps"
        ? libraryRoot
        : path.join(libraryRoot, "steamapps"),
    ),
  ).filter((steamAppsPath) => existsSync(steamAppsPath));
}

function steam_library_paths_from_vdf(libraryFolders: string): string[] {
  const paths: string[] = [];
  const currentFormat = /"path"\s+"((?:\\.|[^"\\])*)"/gi;
  const legacyFormat = /"\d+"\s+"((?:[A-Za-z]:[\\/]|\/)(?:\\.|[^"\\])*)"/g;

  for (const pattern of [currentFormat, legacyFormat]) {
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(libraryFolders)) !== null) {
      if (match[1]) {
        paths.push(decode_vdf_string(match[1]));
      }
    }
  }

  return [...new Set(paths)];
}

function decode_vdf_string(value: string): string {
  return value
    .replace(/\\\\/g, "\\")
    .replace(/\\"/g, '"');
}

async function steam_app_from_manifest(
  bottle: BottleMetadataPayload,
  steamInstall: SteamInstallDetection,
  manifestPath: string,
  manifest: string,
): Promise<InstalledBottleAppPayload | null> {
  const appId = acf_string_value(manifest, "appid");
  const name = acf_string_value(manifest, "name");
  const installDir = acf_string_value(manifest, "installdir");

  if (!appId || !name) {
    return null;
  }

  const steamAppsPath = path.dirname(manifestPath);
  const gameExecutablePath = installDir
    ? await find_steam_game_executable(steamAppsPath, installDir, name)
    : undefined;
  const iconSrc = await iconManager.extractExecutableIcon(gameExecutablePath, bottle_icon_cache_path(bottle.path));

  return {
    id: `steam:${appId}`,
    name,
    subtitle: `Steam App ${appId}`,
    wineVersionId: bottle.wineVersionId,
    executablePath: steamInstall.app.executablePath,
    prefixPath: steamInstall.app.prefixPath,
    executableArgs: steam_game_launch_args(appId),
    launchOptions: { presetId: "steam" },
    iconSrc,
    source: "steam",
    steamAppId: appId,
    steamManifestPath: path.resolve(manifestPath),
    steamLaunchConfirmedAt: new Date().toISOString(),
    lastPlayed: "Never launched",
    lastPlayedKey: "main.lastPlayed.never",
    status: "ready",
  };
}

async function find_steam_game_executable(
  steamAppsPath: string,
  installDir: string,
  appName: string,
): Promise<string | undefined> {
  const appRootPath = path.join(steamAppsPath, "common", installDir);

  if (!existsSync(appRootPath)) {
    return undefined;
  }

  const candidates: string[] = [];
  let visitedEntries = 0;

  await collect_steam_game_executable_candidates(appRootPath, 0, candidates, () => {
    visitedEntries += 1;
    return visitedEntries <= STEAM_GAME_EXE_SCAN_MAX_ENTRIES;
  });

  return candidates
    .map((executablePath) => ({
      executablePath,
      score: score_steam_game_executable_candidate(executablePath, appRootPath, installDir, appName),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.executablePath;
}

async function collect_steam_game_executable_candidates(
  currentPath: string,
  depth: number,
  candidates: string[],
  shouldContinue: () => boolean,
): Promise<void> {
  if (depth > STEAM_GAME_EXE_SCAN_MAX_DEPTH || !shouldContinue()) {
    return;
  }

  let entries: Dirent[];

  try {
    entries = await readdir(currentPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!shouldContinue()) {
      return;
    }

    const entryPath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      if (!STEAM_GAME_SKIP_DIRECTORY_PATTERN.test(entry.name)) {
        await collect_steam_game_executable_candidates(entryPath, depth + 1, candidates, shouldContinue);
      }
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".exe")) {
      candidates.push(entryPath);
    }
  }
}

function score_steam_game_executable_candidate(
  executablePath: string,
  appRootPath: string,
  installDir: string,
  appName: string,
): number {
  const executableName = path.basename(executablePath);
  const normalizedExecutableName = normalize_search_token(executableName.replace(/\.exe$/i, ""));
  const normalizedInstallDir = normalize_search_token(installDir);
  const normalizedAppName = normalize_search_token(appName);
  const relativePath = path.relative(appRootPath, executablePath);

  if (STEAM_GAME_EXCLUDED_EXE_PATTERN.test(executableName)) {
    return 0;
  }

  let score = 100;

  if (!relativePath.includes(path.sep)) {
    score += 500;
  }

  if (normalizedExecutableName === normalizedInstallDir) {
    score += 2200;
  } else if (normalizedInstallDir && normalizedExecutableName.includes(normalizedInstallDir)) {
    score += 900;
  }

  if (normalizedExecutableName === normalizedAppName) {
    score += 2600;
  } else if (normalizedAppName && normalizedExecutableName.includes(normalizedAppName)) {
    score += 1100;
  }

  if (normalizedExecutableName.includes("shipping")) {
    score += 120;
  }

  return score;
}

function steam_game_launch_args(appId: string): string[] {
  return [STEAM_GAME_LAUNCH_ARGUMENT, appId];
}

function acf_string_value(manifest: string, key: string): string {
  return manifest.match(new RegExp(`"${key}"\\s+"([^"]+)"`, "i"))?.[1] ?? "";
}

function windows_path_from_drive_c(bottlePath: string, targetPath: string): string {
  const driveCPath = path.join(bottlePath, "drive_c");
  const relativePath = path.relative(driveCPath, targetPath).split(path.sep).join("\\");

  return `C:\\${relativePath}`;
}

function bottle_icon_cache_path(bottlePath: string): string {
  return path.join(bottlePath, ".cache", "icons");
}

function windows_path_from_host(bottlePath: string, targetPath: string): string {
  const driveCPath = path.join(bottlePath, "drive_c");
  const relativePath = path.relative(driveCPath, targetPath);

  if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return windows_path_from_drive_c(bottlePath, targetPath);
  }

  const sharedRootPath = wine_drive_host_root(bottlePath, "g:");

  if (sharedRootPath && path_is_within_or_equal(sharedRootPath, targetPath)) {
    const sharedRelativePath = path.relative(sharedRootPath, targetPath).split(path.sep).join("\\");
    return sharedRelativePath ? `G:\\${sharedRelativePath}` : "G:\\";
  }

  return `Z:${targetPath.split(path.sep).join("\\")}`;
}

function host_paths_from_app_executable(
  bottlePath: string,
  app: Pick<InstalledBottleAppPayload, "id" | "name" | "source" | "executablePath" | "prefixPath">,
): string[] {
  return unique_paths(
    bottle_app_prefix_candidates(bottlePath, app)
      .map((prefixPath) => host_path_from_app_executable(prefixPath, app.executablePath))
      .filter((candidate): candidate is string => Boolean(candidate)),
  );
}

function host_path_from_app_executable(bottlePath: string, executablePath?: string): string | undefined {
  if (!executablePath) {
    return undefined;
  }

  const normalizedPath = executablePath.replace(/\\/g, "/");

  if (/^[Cc]:\//.test(normalizedPath)) {
    return path.join(bottlePath, "drive_c", normalizedPath.replace(/^[Cc]:\/?/, ""));
  }

  if (/^[Zz]:\//.test(normalizedPath)) {
    return `/${normalizedPath.replace(/^[Zz]:\/?/, "")}`;
  }

  if (/^[Gg]:\//.test(normalizedPath)) {
    const sharedRootPath = wine_drive_host_root(bottlePath, "g:");
    return sharedRootPath
      ? path.join(sharedRootPath, normalizedPath.replace(/^[Gg]:\/?/, ""))
      : undefined;
  }

  if (path.isAbsolute(executablePath)) {
    return executablePath;
  }

  return undefined;
}

function wine_drive_host_root(prefixPath: string, driveName: string): string | undefined {
  const driveLinkPath = path.join(prefixPath, "dosdevices", driveName.toLowerCase());

  try {
    return path.resolve(path.dirname(driveLinkPath), readlinkSync(driveLinkPath));
  } catch {
    return undefined;
  }
}

function path_is_within_or_equal(rootPath: string, targetPath: string): boolean {
  const relativePath = path.relative(path.resolve(rootPath), path.resolve(targetPath));
  return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function bottle_app_uses_prefix(
  bottle: BottleMetadataPayload,
  app: InstalledBottleAppPayload,
  targetPrefixPath: string,
): boolean {
  const appPrefixPath = path.resolve(expand_user_home_path(create_bottle_app_prefix_path(bottle.path, app)));
  const resolvedTargetPrefixPath = path.resolve(expand_user_home_path(targetPrefixPath));

  return appPrefixPath === resolvedTargetPrefixPath;
}

async function resolve_bottle_app_delete_plan(
  bottle: BottleMetadataPayload,
  app: InstalledBottleAppPayload,
  gameInstallPath: string,
): Promise<{ targets: string[]; safeRoots: string[] }> {
  const bottlePath = path.resolve(expand_user_home_path(bottle.path));
  const safeRoots = unique_paths([
    bottlePath,
    gameInstallPath.trim().length > 0 ? expand_user_home_path(gameInstallPath) : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate)));
  const targets: string[] = [];
  const hoyoGame = hoyo_game_from_bottle_app(app);
  const launcher = launcher_from_bottle_app(app);
  const executableHostPaths = host_paths_from_app_executable(bottle.path, app).filter((candidate) => existsSync(candidate));

  if (hoyoGame) {
    targets.push(create_hoyo_game_prefix_path(bottlePath, hoyoGame));
    targets.push(...executableHostPaths.map((executablePath) => path.dirname(executablePath)));
  } else if (app.source === "steam" && app.steamAppId) {
    targets.push(...executableHostPaths.map(steam_game_install_dir_from_executable).filter((candidate): candidate is string => Boolean(candidate)));
  } else if (launcher) {
    targets.push(primary_launcher_prefix_path(bottlePath, launcher));
  } else if (app.source === "manual") {
    targets.push(...executableHostPaths);
  }

  return {
    targets: unique_paths(targets),
    safeRoots,
  };
}

function steam_game_install_dir_from_executable(executablePath: string): string | undefined {
  const parts = path.normalize(executablePath).split(path.sep);
  const commonIndex = parts.findIndex((part, index) =>
    part.toLowerCase() === "common" &&
    parts[index - 1]?.toLowerCase() === "steamapps",
  );

  if (commonIndex < 0 || !parts[commonIndex + 1]) {
    return undefined;
  }

  const prefix = executablePath.startsWith(path.sep) ? path.sep : "";
  return path.join(prefix, ...parts.slice(0, commonIndex + 2));
}

function is_safe_app_delete_path(targetPath: string, safeRoots: string[]): boolean {
  const resolvedTargetPath = path.resolve(expand_user_home_path(targetPath));

  return safeRoots.some((safeRoot) => {
    const resolvedSafeRoot = path.resolve(expand_user_home_path(safeRoot));
    const relativePath = path.relative(resolvedSafeRoot, resolvedTargetPath);

    return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
  });
}

function merge_apps(
  previousApps: InstalledBottleAppPayload[],
  nextApps: InstalledBottleAppPayload[],
): InstalledBottleAppPayload[] {
  const apps = new Map<string, InstalledBottleAppPayload>();

  for (const app of previousApps) {
    apps.set(app.id, app);
  }

  for (const app of nextApps) {
    const previousApp = apps.get(app.id);
    const nextApp: InstalledBottleAppPayload = {
      ...previousApp,
      ...app,
      lastPlayed: previousApp?.lastPlayed ?? app.lastPlayed,
      lastPlayedKey: previousApp?.lastPlayedKey ?? app.lastPlayedKey,
      processId: previousApp?.processId,
      launchError: previousApp?.launchError,
      launchOptions: previousApp?.launchOptions ?? app.launchOptions,
    };

    if (
      app.source === "steam" &&
      app.steamAppId &&
      app.steamManifestPath &&
      existsSync(path.resolve(expand_user_home_path(app.steamManifestPath)))
    ) {
      nextApp.steamManifestMissingChecks = undefined;
    }

    apps.set(app.id, nextApp);
  }

  return [...apps.values()];
}

function reorder_apps_by_preferred_ids(
  apps: InstalledBottleAppPayload[],
  preferredAppIds: string[],
): InstalledBottleAppPayload[] {
  const appsById = new Map(apps.map((app) => [app.id, app]));
  const preferredIdSet = new Set(preferredAppIds);

  return [
    ...preferredAppIds
      .map((appId) => appsById.get(appId))
      .filter((app): app is InstalledBottleAppPayload => Boolean(app)),
    ...apps.filter((app) => !preferredIdSet.has(app.id)),
  ];
}

async function write_prefix_metadata(bottle: BottleMetadataPayload): Promise<void> {
  try {
    const normalizedBottle = normalize_bottle_host_paths(bottle);

    await mkdir(normalizedBottle.path, { recursive: true });
    await writeFile(
      path.join(normalizedBottle.path, "bdih-bottle.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          ...normalizedBottle,
          bottleId: normalizedBottle.id,
          bottleName: normalizedBottle.name,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch {
    // Prefix metadata is best-effort; the registry still keeps the bottle visible.
  }
}

function expand_user_home_path(targetPath: string): string {
  if (targetPath === "~") {
    return process.env.HOME ?? targetPath;
  }

  if (targetPath.startsWith("~/")) {
    return path.join(process.env.HOME ?? "", targetPath.slice(2));
  }

  return targetPath;
}

function normalize_host_path(targetPath: string): string {
  return path.resolve(expand_user_home_path(targetPath.trim()));
}

function normalize_optional_host_path(value: unknown): string | undefined {
  const targetPath = optional_string(value);

  return targetPath ? normalize_host_path(targetPath) : undefined;
}

function normalize_bottle_host_paths(bottle: BottleMetadataPayload): BottleMetadataPayload {
  return {
    ...bottle,
    path: normalize_host_path(bottle.path),
    prefixPath: normalize_host_path(bottle.prefixPath),
    wineRuntimePath: bottle.wineRuntimePath ? normalize_host_path(bottle.wineRuntimePath) : undefined,
    dxmtPackagePath: bottle.dxmtPackagePath ? normalize_host_path(bottle.dxmtPackagePath) : undefined,
    prefixes: bottle.prefixes?.map((prefix) => ({
      ...prefix,
      path: normalize_host_path(prefix.path),
    })),
    apps: bottle.apps.map((app) => ({
      ...app,
      prefixPath: app.prefixPath ? normalize_host_path(app.prefixPath) : undefined,
    })),
  };
}

function unique_paths(paths: string[]): string[] {
  return [...new Set(paths.map(normalize_host_path))];
}

function unique_scan_jobs(jobs: Array<{ prefixPath: string; rootPath: string }>): Array<{ prefixPath: string; rootPath: string }> {
  const seen = new Set<string>();
  const uniqueJobs: Array<{ prefixPath: string; rootPath: string }> = [];

  for (const job of jobs) {
    const key = `${path.resolve(job.prefixPath)}::${path.resolve(job.rootPath)}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueJobs.push({
      prefixPath: path.resolve(job.prefixPath),
      rootPath: path.resolve(job.rootPath),
    });
  }

  return uniqueJobs;
}

function normalize_search_token(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function string_or_default(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function optional_string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function number_or_default(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bottle_status_or_default(value: unknown, fallback: BottleMetadataPayload["status"]): BottleMetadataPayload["status"] {
  if (value === "ready" || value === "needs-setup") {
    return value;
  }

  if (value === "updating") {
    return "needs-setup";
  }

  return fallback;
}

function app_status_or_default(value: unknown): InstalledBottleAppPayload["status"] {
  return value === "needs-prefix" || value === "updating" ? value : "ready";
}

function app_source_or_default(value: unknown): InstalledBottleAppPayload["source"] | undefined {
  return value === "launcher" || value === "steam" || value === "game" || value === "manual" ? value : undefined;
}

function bottle_task_stage_or_default(value: unknown): BottleTaskStage {
  return value === "setup" || value === "dxmt" || value === "download" || value === "downloaded" || value === "install" || value === "error"
    ? value
    : "ready";
}

function is_launcher_log_level(value: unknown): value is BottleMetadataPayload["loggingLevelOverride"] {
  return value === "off" || value === "error" || value === "warn" || value === "info" || value === "debug" || value === "all";
}

function is_missing_file_error(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export const bottleManager = new BottleManager();
