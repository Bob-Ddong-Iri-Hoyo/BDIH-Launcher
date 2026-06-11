import { existsSync } from "fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "fs/promises";
import path from "path";
import {
  BottleListPayload,
  BottleMetadataPayload,
  BottleTaskStage,
  DeleteBottlePayload,
  DeleteBottleResultPayload,
  InstalledBottleAppPayload,
} from "../../Common/Types/IPC";
import { HOYOPLAY_ICON_URL, STEAM_GAME_LAUNCH_ARGUMENT, STEAM_ICON_URL } from "../../Common/Constant/RuntimeSources";
import { get_bottle_registry_path } from "../Environment/AppPaths";
import { preferenceManager } from "./PreferenceManager";

const REGISTRY_VERSION = 1;

interface BottleRegistryState {
  bottles: BottleMetadataPayload[];
  deletedBottleKeys: string[];
}

export class BottleManager {
  private cache: BottleMetadataPayload[] | null = null;

  async getBottleList(forceReload = false): Promise<BottleListPayload> {
    if (!this.cache || forceReload) {
      const registry = await this.loadRegistryState();

      this.cache = await this.buildBottleList([], registry);
      await this.writeRegistryBottles(this.cache, registry.deletedBottleKeys);
    }

    return {
      bottles: this.cache,
    };
  }

  async saveBottleList(payload: BottleListPayload): Promise<BottleListPayload> {
    const incomingBottles = normalize_bottle_array(payload?.bottles);
    const registry = await this.loadRegistryState();
    const deletedBottleKeys = resolve_deleted_bottle_keys(
      registry.deletedBottleKeys,
      this.cache ?? registry.bottles,
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
      await rm(bottlePath, { recursive: true, force: true });

      const registry = await this.loadRegistryState();
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
      };
    } catch (error) {
      return {
        ok: false,
        deletedPath: bottlePath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  clearCache(): void {
    this.cache = null;
  }

  private async buildBottleList(
    incomingBottles: BottleMetadataPayload[] = [],
    registry?: BottleRegistryState,
  ): Promise<BottleMetadataPayload[]> {
    const registryState = registry ?? await this.loadRegistryState();
    const deletedBottleKeys = new Set(registryState.deletedBottleKeys);
    const registryBottles = registryState.bottles.filter((bottle) => !is_deleted_bottle(bottle, deletedBottleKeys));
    const scannedBottles = await this.scanDefaultPrefixBottles();
    const visibleScannedBottles = scannedBottles.filter((bottle) => !is_deleted_bottle(bottle, deletedBottleKeys));
    const visibleIncomingBottles = incomingBottles.filter((bottle) => !is_deleted_bottle(bottle, deletedBottleKeys));
    const registryAndScannedBottles = merge_bottles(registryBottles, visibleScannedBottles);
    const mergedBottles = merge_bottles(visibleIncomingBottles, registryAndScannedBottles);
    const enrichedBottles = await Promise.all(mergedBottles.map((bottle) => enrich_bottle_apps_from_prefix(bottle)));

    await Promise.all(enrichedBottles.map((bottle) => write_prefix_metadata(bottle)));

    return enrichedBottles;
  }

  private async writeRegistryBottles(
    bottles: BottleMetadataPayload[],
    deletedBottleKeys: string[] = [],
  ): Promise<void> {
    const registryPath = get_bottle_registry_path();

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
    const registryPath = get_bottle_registry_path();

    try {
      const raw = await readFile(registryPath, "utf8");
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
    } catch (error) {
      if (is_missing_file_error(error)) {
        return {
          bottles: [],
          deletedBottleKeys: [],
        };
      }

      throw error;
    }
  }

  private async scanDefaultPrefixBottles(): Promise<BottleMetadataPayload[]> {
    const preference = await preferenceManager.getPreference();
    const prefixRoot = expand_user_home_path(preference.bottlePrefixPath);

    if (!existsSync(prefixRoot)) {
      return [];
    }

    try {
      const entries = await readdir(prefixRoot, { withFileTypes: true });
      const bottles = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => {
            const bottlePath = path.join(prefixRoot, entry.name);
            const metadataPath = path.join(bottlePath, "bdih-bottle.json");

            try {
              if (existsSync(metadataPath)) {
                const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as unknown;
                const normalized = normalize_bottle(metadata, bottlePath);

                if (normalized) {
                  return normalized;
                }
              }

              const stats = await stat(bottlePath);
              const scannedBottle = create_scanned_bottle(entry.name, bottlePath, stats.birthtime.toISOString());
              await write_prefix_metadata(scannedBottle);
              return scannedBottle;
            } catch {
              const stats = await stat(bottlePath);
              const scannedBottle = create_scanned_bottle(entry.name, bottlePath, stats.birthtime.toISOString());
              await write_prefix_metadata(scannedBottle);
              return scannedBottle;
            }
          }),
      );

      return bottles.filter((bottle): bottle is BottleMetadataPayload => Boolean(bottle));
    } catch {
      return [];
    }
  }
}

function normalize_bottle_array(value: unknown): BottleMetadataPayload[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalize_bottle(item))
    .filter((bottle): bottle is BottleMetadataPayload => Boolean(bottle));
}

function normalize_bottle(value: unknown, fallbackPath = ""): BottleMetadataPayload | null {
  if (!is_record(value)) {
    return null;
  }

  const id = string_or_default(value.id, string_or_default(value.bottleId, ""));
  const name = string_or_default(value.name, string_or_default(value.bottleName, path.basename(fallbackPath)));
  const bottlePath = string_or_default(value.path, string_or_default(value.bottlePath, fallbackPath));
  const createdAt = string_or_default(value.createdAt, string_or_default(value.updatedAt, new Date().toISOString()));

  if (!id || !name || !bottlePath) {
    return null;
  }

  return {
    id,
    name,
    description: string_or_default(value.description, name),
    wineVersionId: string_or_default(value.wineVersionId, ""),
    dxmtVersionId: optional_string(value.dxmtVersionId),
    path: bottlePath,
    prefixPath: optional_string(value.prefixPath) ?? path.dirname(bottlePath),
    status: bottle_status_or_default(value.status, "ready"),
    setupTask: is_record(value.setupTask) ? {
      stage: bottle_task_stage_or_default(value.setupTask.stage),
      progress: number_or_default(value.setupTask.progress, 100),
      message: optional_string(value.setupTask.message),
    } : undefined,
    launcherTasks: is_record(value.launcherTasks) ? value.launcherTasks as BottleMetadataPayload["launcherTasks"] : undefined,
    loggingLevelOverride: is_launcher_log_level(value.loggingLevelOverride) ? value.loggingLevelOverride : undefined,
    wineDebugArgsOverride: optional_string(value.wineDebugArgsOverride),
    apps: normalize_apps(value.apps),
    createdAt,
    updatedAt: string_or_default(value.updatedAt, createdAt),
  };
}

function resolve_deleted_bottle_keys(
  existingDeletedBottleKeys: string[],
  previousBottles: BottleMetadataPayload[],
  incomingBottles: BottleMetadataPayload[],
): string[] {
  const deletedBottleKeys = new Set(normalize_deleted_bottle_keys(existingDeletedBottleKeys));
  const incomingBottleKeys = new Set(incomingBottles.flatMap(bottle_identity_keys));

  for (const key of incomingBottleKeys) {
    deletedBottleKeys.delete(key);
  }

  for (const bottle of previousBottles) {
    if (bottle_has_any_identity_key(bottle, incomingBottleKeys)) {
      continue;
    }

    for (const key of bottle_identity_keys(bottle)) {
      deletedBottleKeys.add(key);
    }
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
      const id = string_or_default(app.id, "");
      const name = string_or_default(app.name, "");
      const wineVersionId = string_or_default(app.wineVersionId, "");
      const executablePath = optional_string(app.executablePath);
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
        executableArgs: executableArgs.length > 0
          ? executableArgs
          : steamAppId
            ? steam_game_launch_args(steamAppId)
            : undefined,
        iconSrc: optional_string(app.iconSrc),
        source: app_source_or_default(app.source),
        steamAppId,
        lastPlayed: string_or_default(app.lastPlayed, "Never launched"),
        lastPlayedKey: optional_string(app.lastPlayedKey),
        status: app_status_or_default(app.status),
        launchError: optional_string(app.launchError),
      };
    })
    .filter((app): app is InstalledBottleAppPayload => Boolean(app));
}

function merge_bottles(
  registryBottles: BottleMetadataPayload[],
  scannedBottles: BottleMetadataPayload[],
): BottleMetadataPayload[] {
  const merged = new Map<string, BottleMetadataPayload>();

  for (const bottle of scannedBottles) {
    merged.set(bottle.id, bottle);
    merged.set(bottle.path, bottle);
  }

  for (const bottle of registryBottles) {
    const previous = merged.get(bottle.id) ?? merged.get(bottle.path);
    const next = previous ? { ...previous, ...bottle, apps: merge_apps(previous.apps, bottle.apps) } : bottle;

    merged.set(next.id, next);
    merged.set(next.path, next);
  }

  return [...new Map([...merged.values()].map((bottle) => [bottle.id, bottle])).values()]
    .sort((left, right) => string_or_default(right.updatedAt, "").localeCompare(string_or_default(left.updatedAt, "")));
}

function create_scanned_bottle(name: string, bottlePath: string, createdAt: string): BottleMetadataPayload {
  return {
    id: `scanned:${bottlePath}`,
    name,
    description: name,
    wineVersionId: "",
    path: bottlePath,
    prefixPath: path.dirname(bottlePath),
    status: "needs-setup",
    apps: [],
    createdAt,
    updatedAt: createdAt,
  };
}

async function enrich_bottle_apps_from_prefix(bottle: BottleMetadataPayload): Promise<BottleMetadataPayload> {
  const detectedApps = await detect_installed_apps(bottle);
  const existingApps = prune_unavailable_launcher_apps(bottle);

  if (detectedApps.length === 0 && existingApps.length === bottle.apps.length) {
    return bottle;
  }

  return {
    ...bottle,
    apps: merge_apps(existingApps, detectedApps),
    updatedAt: new Date().toISOString(),
  };
}

function prune_unavailable_launcher_apps(bottle: BottleMetadataPayload): InstalledBottleAppPayload[] {
  return bottle.apps.filter((app) => !is_unavailable_launcher_app(bottle, app));
}

function is_unavailable_launcher_app(
  bottle: BottleMetadataPayload,
  app: InstalledBottleAppPayload,
): boolean {
  if (is_launcher_installer_app(app.id, app.name, app.executablePath)) {
    return true;
  }

  if (app.id === "steam") {
    return !steam_executable_candidates(bottle.path).some((candidate) => existsSync(candidate));
  }

  if (app.id === "hoyoplay") {
    return !hoyoplay_executable_candidates(bottle.path).some((candidate) => existsSync(candidate));
  }

  return false;
}

function is_launcher_installer_app(id: string, name: string, executablePath?: string): boolean {
  const searchable = `${id} ${name} ${executablePath ?? ""}`.toLowerCase().replace(/\\/g, "/").trim();

  return /(^|[/\s_-])steamsetup\.exe$/i.test(searchable)
    || /(^|[/\s_-])hoyoplay.*setup.*\.exe$/i.test(searchable)
    || /(^|[/\s_-])hoyoplay.*installer.*\.exe$/i.test(searchable);
}

async function detect_installed_apps(bottle: BottleMetadataPayload): Promise<InstalledBottleAppPayload[]> {
  const apps: InstalledBottleAppPayload[] = [];
  const steamInstall = detect_steam_install(bottle);

  if (steamInstall) {
    apps.push(steamInstall.app);
    apps.push(...await detect_steam_games(bottle, steamInstall));
  }

  const hoyoplayInstall = detect_hoyoplay_install(bottle);

  if (hoyoplayInstall) {
    apps.push(hoyoplayInstall);
  }

  return apps;
}

function detect_steam_install(bottle: BottleMetadataPayload): {
  app: InstalledBottleAppPayload;
  steamRootPath: string;
  executablePath: string;
} | null {
  const executablePath = steam_executable_candidates(bottle.path).find((candidate) => existsSync(candidate));

  if (!executablePath) {
    return null;
  }

  return {
    steamRootPath: path.dirname(executablePath),
    executablePath,
    app: {
      id: "steam",
      name: "Steam",
      subtitle: "Windows game launcher",
      wineVersionId: bottle.wineVersionId,
      executablePath: windows_path_from_drive_c(bottle.path, executablePath),
      iconSrc: STEAM_ICON_URL,
      source: "launcher",
      lastPlayed: "Never launched",
      lastPlayedKey: "main.lastPlayed.never",
      status: "ready",
    },
  };
}

function detect_hoyoplay_install(bottle: BottleMetadataPayload): InstalledBottleAppPayload | null {
  const executablePath = hoyoplay_executable_candidates(bottle.path).find((candidate) => existsSync(candidate));

  if (!executablePath) {
    return null;
  }

  return {
    id: "hoyoplay",
    name: "HoYoPlay",
    subtitle: "HoYoverse game launcher",
    wineVersionId: bottle.wineVersionId,
    executablePath: windows_path_from_drive_c(bottle.path, executablePath),
    iconSrc: HOYOPLAY_ICON_URL,
    source: "launcher",
    lastPlayed: "Never launched",
    lastPlayedKey: "main.lastPlayed.never",
    status: "ready",
  };
}

function steam_executable_candidates(bottlePath: string): string[] {
  return [
    path.join(bottlePath, "drive_c", "Program Files (x86)", "Steam", "steam.exe"),
    path.join(bottlePath, "drive_c", "Program Files", "Steam", "steam.exe"),
  ];
}

function hoyoplay_executable_candidates(bottlePath: string): string[] {
  return [
    path.join(bottlePath, "drive_c", "Program Files", "HoYoPlay", "launcher.exe"),
    path.join(bottlePath, "drive_c", "Program Files", "HoYoPlay", "HoYoPlay.exe"),
    path.join(bottlePath, "drive_c", "Program Files (x86)", "HoYoPlay", "launcher.exe"),
    path.join(bottlePath, "drive_c", "Program Files (x86)", "HoYoPlay", "HoYoPlay.exe"),
  ];
}

async function detect_steam_games(
  bottle: BottleMetadataPayload,
  steamInstall: { steamRootPath: string; app: InstalledBottleAppPayload },
): Promise<InstalledBottleAppPayload[]> {
  const steamAppsPath = path.join(steamInstall.steamRootPath, "steamapps");

  if (!existsSync(steamAppsPath)) {
    return [];
  }

  try {
    const entries = await readdir(steamAppsPath, { withFileTypes: true });
    const manifests = entries
      .filter((entry) => entry.isFile() && /^appmanifest_\d+\.acf$/i.test(entry.name))
      .map((entry) => path.join(steamAppsPath, entry.name));
    const apps = await Promise.all(
      manifests.map(async (manifestPath) => {
        try {
          return steam_app_from_manifest(bottle, steamInstall.app, await readFile(manifestPath, "utf8"));
        } catch {
          return null;
        }
      }),
    );

    return apps.filter((app): app is InstalledBottleAppPayload => Boolean(app));
  } catch {
    return [];
  }
}

function steam_app_from_manifest(
  bottle: BottleMetadataPayload,
  steamApp: InstalledBottleAppPayload,
  manifest: string,
): InstalledBottleAppPayload | null {
  const appId = acf_string_value(manifest, "appid");
  const name = acf_string_value(manifest, "name");

  if (!appId || !name) {
    return null;
  }

  return {
    id: `steam:${appId}`,
    name,
    subtitle: `Steam App ${appId}`,
    wineVersionId: bottle.wineVersionId,
    executablePath: steamApp.executablePath,
    executableArgs: steam_game_launch_args(appId),
    iconSrc: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/capsule_184x69.jpg`,
    source: "steam",
    steamAppId: appId,
    lastPlayed: "Never launched",
    lastPlayedKey: "main.lastPlayed.never",
    status: "ready",
  };
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

function merge_apps(
  previousApps: InstalledBottleAppPayload[],
  nextApps: InstalledBottleAppPayload[],
): InstalledBottleAppPayload[] {
  const apps = new Map<string, InstalledBottleAppPayload>();

  for (const app of previousApps) {
    apps.set(app.id, app);
  }

  for (const app of nextApps) {
    apps.set(app.id, {
      ...apps.get(app.id),
      ...app,
      lastPlayed: apps.get(app.id)?.lastPlayed ?? app.lastPlayed,
      lastPlayedKey: apps.get(app.id)?.lastPlayedKey ?? app.lastPlayedKey,
      processId: apps.get(app.id)?.processId,
      launchError: apps.get(app.id)?.launchError,
    });
  }

  return [...apps.values()];
}

async function write_prefix_metadata(bottle: BottleMetadataPayload): Promise<void> {
  try {
    await writeFile(
      path.join(bottle.path, "bdih-bottle.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          id: bottle.id,
          bottleId: bottle.id,
          name: bottle.name,
          bottleName: bottle.name,
          description: bottle.description,
          path: bottle.path,
          prefixPath: bottle.prefixPath,
          wineVersionId: bottle.wineVersionId,
          dxmtVersionId: bottle.dxmtVersionId,
          status: bottle.status,
          apps: bottle.apps,
          createdAt: bottle.createdAt,
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
  return value === "setup" || value === "dxmt" || value === "download" || value === "install" || value === "error"
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
