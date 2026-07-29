import { app } from "electron";
import type { Dirent } from "fs";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "fs/promises";
import path from "path";
import {
  get_app_data_lifecycle_state_path,
  get_bottle_registry_path,
  is_nightly_launcher_build,
} from "../Environment/AppPaths";
import { logManager } from "./LogManager";

export type AppBuildChannel = "stable" | "beta" | "nightly";

interface AppDataLifecycleState {
  schemaVersion: 1;
  version: string;
  channel: AppBuildChannel;
  recordedAt: string;
}

interface BottlePathRecord {
  path?: unknown;
  prefixes?: unknown;
  apps?: unknown;
}

export interface AppDataMaintenanceResult {
  previous?: Pick<AppDataLifecycleState, "version" | "channel">;
  current: Pick<AppDataLifecycleState, "version" | "channel">;
  cleanupEligible: boolean;
  removedPaths: string[];
  reason: "first-launch" | "same-build" | "channel-transition" | "same-channel-update";
}

/**
 * Performs only explicitly registered, app-owned retirement work. Unknown files
 * are never inferred to be obsolete merely because the current build does not
 * recognize them.
 */
export class AppDataMaintenanceManager {
  private readonly logger = logManager.createLogger({
    file: "app",
    source: "AppDataMaintenanceManager",
  });

  constructor(
    private readonly getAppVersion: () => string = () => app.getVersion(),
    private readonly getBuildChannel: () => AppBuildChannel = () =>
      app_build_channel(app.getVersion(), is_nightly_launcher_build()),
  ) {}

  async reconcileStartup(dataRootPath: string): Promise<AppDataMaintenanceResult> {
    const statePath = get_app_data_lifecycle_state_path(dataRootPath);
    const previous = await read_lifecycle_state(statePath);
    const current: AppDataLifecycleState = {
      schemaVersion: 1,
      version: this.getAppVersion(),
      channel: this.getBuildChannel(),
      recordedAt: new Date().toISOString(),
    };
    const sameBuild = previous?.version === current.version
      && previous.channel === current.channel;
    const cleanupEligible = Boolean(
      previous
      && previous.version !== current.version
      && previous.channel === current.channel,
    );
    const reason: AppDataMaintenanceResult["reason"] = !previous
      ? "first-launch"
      : sameBuild
        ? "same-build"
        : cleanupEligible
          ? "same-channel-update"
          : "channel-transition";
    const removedPaths = cleanupEligible
      ? await remove_retired_app_metadata(dataRootPath)
      : [];

    if (!sameBuild) {
      await write_lifecycle_state(statePath, current);
    }

    const result: AppDataMaintenanceResult = {
      previous: previous
        ? { version: previous.version, channel: previous.channel }
        : undefined,
      current: { version: current.version, channel: current.channel },
      cleanupEligible,
      removedPaths,
      reason,
    };

    this.logger.info("startup", "App-data maintenance policy evaluated.", result);
    return result;
  }
}

export function app_build_channel(
  version: string,
  nightlyBuild: boolean,
): AppBuildChannel {
  if (nightlyBuild) {
    return "nightly";
  }

  return /^\d+\.\d+\.\d+-beta\.[0-9A-Za-z.-]+(?:\+[0-9A-Za-z.-]+)?$/.test(version.trim())
    ? "beta"
    : "stable";
}

async function remove_retired_app_metadata(dataRootPath: string): Promise<string[]> {
  const prefixPaths = await read_managed_prefix_paths(dataRootPath);
  const removedPaths: string[] = [];

  for (const prefixPath of prefixPaths) {
    const legacyInstallerDir = path.join(prefixPath, "_bdih_installers");
    let entries: Dirent[];

    try {
      entries = await readdir(legacyInstallerDir, { withFileTypes: true });
    } catch (error) {
      if (is_missing_file_error(error)) {
        continue;
      }
      throw error;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".bdih.json")) {
        continue;
      }

      const retiredPath = path.join(legacyInstallerDir, entry.name);
      await rm(retiredPath, { force: true });
      removedPaths.push(retiredPath);
    }
  }

  return removedPaths;
}

async function read_managed_prefix_paths(dataRootPath: string): Promise<string[]> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(await readFile(get_bottle_registry_path(dataRootPath), "utf8")) as unknown;
  } catch (error) {
    if (is_missing_file_error(error) || error instanceof SyntaxError) {
      return [];
    }
    throw error;
  }

  if (!is_record(parsed) || !Array.isArray(parsed.bottles)) {
    return [];
  }

  const prefixPaths = new Set<string>();

  for (const value of parsed.bottles) {
    if (!is_record(value)) {
      continue;
    }

    const bottle = value as BottlePathRecord;
    const bottlePath = normalized_path(bottle.path);

    if (!bottlePath) {
      continue;
    }

    remember_managed_prefix(prefixPaths, bottlePath, bottlePath);

    if (Array.isArray(bottle.prefixes)) {
      for (const prefix of bottle.prefixes) {
        if (is_record(prefix)) {
          remember_managed_prefix(prefixPaths, bottlePath, normalized_path(prefix.path));
        }
      }
    }

    if (Array.isArray(bottle.apps)) {
      for (const installedApp of bottle.apps) {
        if (is_record(installedApp)) {
          remember_managed_prefix(prefixPaths, bottlePath, normalized_path(installedApp.prefixPath));
        }
      }
    }
  }

  return [...prefixPaths];
}

function remember_managed_prefix(
  prefixPaths: Set<string>,
  bottlePath: string,
  candidatePath: string | undefined,
): void {
  if (!candidatePath) {
    return;
  }

  const relativePath = path.relative(bottlePath, candidatePath);
  if (
    relativePath === ""
    || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  ) {
    prefixPaths.add(candidatePath);
  }
}

async function read_lifecycle_state(statePath: string): Promise<AppDataLifecycleState | undefined> {
  try {
    const parsed = JSON.parse(await readFile(statePath, "utf8")) as unknown;

    if (
      !is_record(parsed)
      || parsed.schemaVersion !== 1
      || typeof parsed.version !== "string"
      || !is_app_build_channel(parsed.channel)
      || typeof parsed.recordedAt !== "string"
    ) {
      return undefined;
    }

    return parsed as unknown as AppDataLifecycleState;
  } catch (error) {
    if (is_missing_file_error(error) || error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

async function write_lifecycle_state(
  statePath: string,
  state: AppDataLifecycleState,
): Promise<void> {
  const temporaryPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;

  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });

  try {
    await rename(temporaryPath, statePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

function normalized_path(value: unknown): string | undefined {
  return typeof value === "string" && value.trim()
    ? path.resolve(expand_user_home_path(value.trim()))
    : undefined;
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
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function is_app_build_channel(value: unknown): value is AppBuildChannel {
  return value === "stable" || value === "beta" || value === "nightly";
}

function is_missing_file_error(error: unknown): boolean {
  return is_record(error) && error.code === "ENOENT";
}

export const appDataMaintenanceManager = new AppDataMaintenanceManager();
