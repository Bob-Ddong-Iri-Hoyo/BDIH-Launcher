import { existsSync } from "fs";
import { readdir } from "fs/promises";
import path from "path";
import type {
  RuntimeDiscoveryDrive,
  RuntimeLauncherProfile,
} from "../../Common/Types/DataProtoType";

export interface RuntimeExecutableDiscoveryOptions {
  includeFallback?: boolean;
}

/** Finds a launcher executable from profile data without hardcoding app paths in managers. */
export async function find_runtime_profile_executable(
  prefixPath: string,
  profile: RuntimeLauncherProfile,
  options: RuntimeExecutableDiscoveryOptions = {},
): Promise<string | undefined> {
  const driveRoots = await resolve_discovery_drive_roots(
    prefixPath,
    profile.executableDiscovery.fallbackDrives,
  );

  for (const rootPath of driveRoots) {
    for (const relativePath of profile.executableDiscovery.preferredRelativePaths) {
      const candidatePath = path.join(rootPath, ...relativePath.split(/[\\/]+/).filter(Boolean));

      if (existsSync(candidatePath)) {
        return candidatePath;
      }
    }
  }

  if (options.includeFallback === false) {
    return undefined;
  }

  const executableNames = new Set(profile.executableNames.map((name) => name.toLowerCase()));
  const skipDirectoryNames = new Set(
    (profile.executableDiscovery.skipDirectoryNames ?? []).map((name) => name.toLowerCase()),
  );

  for (const rootPath of driveRoots) {
    const discoveredPath = await find_executable_bounded(
      rootPath,
      executableNames,
      skipDirectoryNames,
      profile.executableDiscovery.maxDepth,
      profile.executableDiscovery.maxEntries,
    );

    if (discoveredPath) {
      return discoveredPath;
    }
  }

  return undefined;
}

async function resolve_discovery_drive_roots(
  prefixPath: string,
  drives: readonly RuntimeDiscoveryDrive[],
): Promise<string[]> {
  const roots: string[] = [];

  for (const drive of drives) {
    const rootPath = path.join(prefixPath, `drive_${drive}`);

    if (existsSync(rootPath) && !roots.includes(rootPath)) {
      roots.push(rootPath);
    }
  }

  return roots;
}

async function find_executable_bounded(
  rootPath: string,
  executableNames: ReadonlySet<string>,
  skipDirectoryNames: ReadonlySet<string>,
  maxDepth: number,
  maxEntries: number,
): Promise<string | undefined> {
  const queue: Array<{ directoryPath: string; depth: number }> = [{ directoryPath: rootPath, depth: 0 }];
  let visitedEntries = 0;

  while (queue.length > 0 && visitedEntries < maxEntries) {
    const current = queue.shift();

    if (!current) {
      break;
    }

    let entries;

    try {
      entries = await readdir(current.directoryPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      visitedEntries += 1;

      if (visitedEntries > maxEntries) {
        return undefined;
      }

      const entryPath = path.join(current.directoryPath, entry.name);

      if (entry.isFile() && executableNames.has(entry.name.toLowerCase())) {
        return entryPath;
      }

      if (
        entry.isDirectory()
        && current.depth < maxDepth
        && !skipDirectoryNames.has(entry.name.toLowerCase())
      ) {
        queue.push({ directoryPath: entryPath, depth: current.depth + 1 });
      }
    }
  }

  return undefined;
}
