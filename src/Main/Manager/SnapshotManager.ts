import { createHash, randomUUID } from "crypto";
import { constants } from "fs";
import { chmod, copyFile, cp, mkdir, readFile, rename, rm, stat } from "fs/promises";
import path from "path";
import type {
  AppDataCompatibilityContract,
  MetadataSnapshotEntry,
  PrefixSnapshotEntry,
  StableReturnPoint,
} from "../../Common/Types/Compatibility";
import {
  get_bottle_registry_path,
  get_channel_transition_state_path,
  get_settings_path,
  get_snapshot_root_path,
} from "../Environment/AppPaths";
import { writeConfigFile } from "../FileIO/IO";
import { logManager } from "./LogManager";

const RETURN_POINT_SCHEMA_VERSION = 1;

/**
 * Owns snapshot storage and recovery material. It deliberately does not decide
 * when a snapshot is required; ChannelTransitionManager and the execution core
 * enforce that policy before invoking mutations.
 */
export class SnapshotManager {
  private readonly logger = logManager.createLogger({ file: "app", source: "SnapshotManager" });
  private operationQueue: Promise<void> = Promise.resolve();

  createStableReturnPoint(input: {
    stableVersion: string;
    dataRootPath: string;
    contract: AppDataCompatibilityContract;
  }): Promise<StableReturnPoint> {
    return this.runExclusive(async () => {
      const existing = await this.readReturnPoint();

      if (existing?.state === "active" && existing.stableVersion === input.stableVersion) {
        return existing;
      }

      const createdAt = new Date().toISOString();
      const id = `stable-${safe_path_part(input.stableVersion)}-${createdAt.replace(/[^0-9]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
      const snapshotRootPath = path.join(get_snapshot_root_path(input.dataRootPath), id);
      const metadataRoot = path.join(snapshotRootPath, "metadata");

      await mkdir(metadataRoot, { recursive: true, mode: 0o700 });

      try {
        const settings = await this.snapshotMetadataFile(
          get_settings_path(),
          path.join(metadataRoot, "settings.json"),
        );
        const bottleRegistry = await this.snapshotMetadataFile(
          get_bottle_registry_path(input.dataRootPath),
          path.join(metadataRoot, "appmeta.json"),
        );
        const prefixMetadata = await this.snapshotPrefixMetadataFiles(
          input.dataRootPath,
          metadataRoot,
        );
        const returnPoint: StableReturnPoint = {
          schemaVersion: RETURN_POINT_SCHEMA_VERSION,
          id,
          state: "active",
          stableVersion: input.stableVersion,
          createdAt,
          dataRootPath: path.resolve(input.dataRootPath),
          snapshotRootPath,
          contract: input.contract,
          metadata: {
            settings,
            bottleRegistry,
            prefixMetadata,
          },
          prefixes: [],
        };

        await this.writeReturnPoint(returnPoint);
        if (
          existing
          && existing.snapshotRootPath !== returnPoint.snapshotRootPath
          && is_valid_snapshot_location(existing)
        ) {
          try {
            await rm(existing.snapshotRootPath, { recursive: true, force: true });
          } catch (error) {
            this.logger.warn("cleanup", "Could not remove the previous Stable snapshot.", {
              snapshotRootPath: existing.snapshotRootPath,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        this.logger.info("created", "Stable return point created.", {
          id,
          stableVersion: input.stableVersion,
          dataRootPath: input.dataRootPath,
        });
        return returnPoint;
      } catch (error) {
        await rm(snapshotRootPath, { recursive: true, force: true });
        throw error;
      }
    });
  }

  getActiveReturnPoint(): Promise<StableReturnPoint | undefined> {
    return this.readReturnPoint().then((returnPoint) =>
      returnPoint?.state === "active" ? returnPoint : undefined,
    );
  }

  ensurePrefixSnapshot(input: {
    bottleId: string;
    prefixPath: string;
  }): Promise<PrefixSnapshotEntry | undefined> {
    return this.runExclusive(async () => {
      const returnPoint = await this.readReturnPoint();

      if (!returnPoint || returnPoint.state !== "active") {
        return undefined;
      }

      const originalPath = path.resolve(input.prefixPath);
      const existing = returnPoint.prefixes.find((entry) =>
        path.resolve(entry.originalPath) === originalPath,
      );

      if (existing) {
        return existing;
      }

      const snapshotRoot = path.resolve(returnPoint.snapshotRootPath);

      if (
        path_contains(snapshotRoot, originalPath)
        || path_contains(originalPath, snapshotRoot)
      ) {
        throw new Error(`Refusing overlapping Prefix and snapshot paths: ${originalPath}`);
      }

      const existed = await path_exists(originalPath);
      const snapshotName = `${safe_path_part(input.bottleId)}-${createHash("sha256").update(originalPath).digest("hex").slice(0, 12)}`;
      const prefixRoot = path.join(snapshotRoot, "prefixes");
      const snapshotPath = path.join(prefixRoot, snapshotName);
      const temporaryPath = `${snapshotPath}.${randomUUID()}.creating`;

      await mkdir(prefixRoot, { recursive: true, mode: 0o700 });

      try {
        if (existed) {
          await clone_directory(originalPath, temporaryPath);
          await rename(temporaryPath, snapshotPath);
        }

        const entry: PrefixSnapshotEntry = {
          bottleId: input.bottleId,
          originalPath,
          snapshotPath: existed ? snapshotPath : undefined,
          existed,
          createdAt: new Date().toISOString(),
        };
        const nextReturnPoint: StableReturnPoint = {
          ...returnPoint,
          prefixes: [...returnPoint.prefixes, entry],
        };

        await this.writeReturnPoint(nextReturnPoint);
        this.logger.info("prefix", "Bottle prefix snapshot created.", {
          returnPointId: returnPoint.id,
          bottleId: input.bottleId,
          prefixPath: originalPath,
          existed,
        });
        return entry;
      } finally {
        await rm(temporaryPath, { recursive: true, force: true });
      }
    });
  }

  markReturnRequested(): Promise<StableReturnPoint | undefined> {
    return this.runExclusive(async () => {
      const returnPoint = await this.readReturnPoint();

      if (!returnPoint || returnPoint.state !== "active") {
        return undefined;
      }

      const next = {
        ...returnPoint,
        returnRequestedAt: returnPoint.returnRequestedAt ?? new Date().toISOString(),
      };

      await this.writeReturnPoint(next);
      return next;
    });
  }

  completeReturnPoint(): Promise<StableReturnPoint | undefined> {
    return this.runExclusive(async () => {
      const returnPoint = await this.readReturnPoint();

      if (!returnPoint || returnPoint.state !== "active") {
        return undefined;
      }

      const next: StableReturnPoint = {
        ...returnPoint,
        state: "completed",
        completedAt: new Date().toISOString(),
      };

      await this.writeReturnPoint(next);
      return next;
    });
  }

  private async snapshotMetadataFile(
    sourcePath: string,
    snapshotPath: string,
  ): Promise<MetadataSnapshotEntry> {
    const existed = await path_exists(sourcePath);

    if (existed) {
      await copyFile(sourcePath, snapshotPath, constants.COPYFILE_FICLONE);
      await chmod(snapshotPath, 0o600);
    }

    return {
      sourcePath: path.resolve(sourcePath),
      snapshotPath: existed ? snapshotPath : undefined,
      existed,
    };
  }

  private async snapshotPrefixMetadataFiles(
    dataRootPath: string,
    metadataRoot: string,
  ): Promise<MetadataSnapshotEntry[]> {
    let registry: unknown;

    try {
      registry = JSON.parse(await readFile(get_bottle_registry_path(dataRootPath), "utf8"));
    } catch (error) {
      if (is_missing_file_error(error) || error instanceof SyntaxError) {
        return [];
      }

      throw error;
    }

    if (typeof registry !== "object" || registry === null) {
      return [];
    }

    const bottles = Array.isArray((registry as { bottles?: unknown }).bottles)
      ? (registry as { bottles: unknown[] }).bottles
      : [];
    const metadataPaths = new Set<string>();

    for (const value of bottles) {
      if (typeof value !== "object" || value === null) {
        continue;
      }

      const bottle = value as {
        path?: unknown;
        prefixes?: unknown;
        apps?: unknown;
      };
      const candidatePaths: unknown[] = [bottle.path];

      if (Array.isArray(bottle.prefixes)) {
        candidatePaths.push(...bottle.prefixes.map((prefix) =>
          typeof prefix === "object" && prefix !== null
            ? (prefix as { path?: unknown }).path
            : undefined,
        ));
      }

      if (Array.isArray(bottle.apps)) {
        candidatePaths.push(...bottle.apps.map((appEntry) =>
          typeof appEntry === "object" && appEntry !== null
            ? (appEntry as { prefixPath?: unknown }).prefixPath
            : undefined,
        ));
      }

      for (const candidatePath of candidatePaths) {
        if (typeof candidatePath === "string" && candidatePath.trim()) {
          metadataPaths.add(path.join(path.resolve(candidatePath), "bdih-bottle.json"));
        }
      }
    }

    const snapshotRoot = path.join(metadataRoot, "prefixes");
    await mkdir(snapshotRoot, { recursive: true, mode: 0o700 });
    const snapshots: MetadataSnapshotEntry[] = [];

    for (const sourcePath of metadataPaths) {
      const fileName = `${createHash("sha256").update(sourcePath).digest("hex")}.json`;
      snapshots.push(await this.snapshotMetadataFile(
        sourcePath,
        path.join(snapshotRoot, fileName),
      ));
    }

    return snapshots;
  }

  private async readReturnPoint(): Promise<StableReturnPoint | undefined> {
    try {
      const parsed = JSON.parse(await readFile(get_channel_transition_state_path(), "utf8")) as StableReturnPoint;

      return is_valid_return_point(parsed)
        ? parsed
        : undefined;
    } catch (error) {
      if (is_missing_file_error(error) || error instanceof SyntaxError) {
        return undefined;
      }

      throw error;
    }
  }

  private async writeReturnPoint(returnPoint: StableReturnPoint): Promise<void> {
    const serialized = `${JSON.stringify(returnPoint, null, 2)}\n`;

    // Publish the snapshot-local manifest first. The settings-side pointer is
    // authoritative and must never reference a manifest that failed to write.
    await writeConfigFile(path.join(returnPoint.snapshotRootPath, "manifest.json"), serialized);
    await writeConfigFile(get_channel_transition_state_path(), serialized);
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation);

    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

async function clone_directory(sourcePath: string, targetPath: string): Promise<void> {
  await cp(sourcePath, targetPath, {
    recursive: true,
    force: false,
    errorOnExist: true,
    mode: constants.COPYFILE_FICLONE,
    preserveTimestamps: true,
  });
}

async function path_exists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if (is_missing_file_error(error)) {
      return false;
    }

    throw error;
  }
}

function is_missing_file_error(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function safe_path_part(value: string): string {
  return value.trim().replace(/[^0-9A-Za-z._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function is_valid_return_point(value: unknown): value is StableReturnPoint {
  if (
    typeof value !== "object"
    || value === null
    || (value as StableReturnPoint).schemaVersion !== RETURN_POINT_SCHEMA_VERSION
  ) {
    return false;
  }

  const candidate = value as StableReturnPoint;

  return typeof candidate.id === "string"
    && candidate.id.length > 0
    && candidate.id === safe_path_part(candidate.id)
    && typeof candidate.stableVersion === "string"
    && /^\d+\.\d+\.\d+(?:-rc\.[1-9]\d*)?(?:\+[0-9A-Za-z.-]+)?$/.test(candidate.stableVersion)
    && typeof candidate.dataRootPath === "string"
    && typeof candidate.snapshotRootPath === "string"
    && (candidate.state === "active" || candidate.state === "completed")
    && Array.isArray(candidate.prefixes)
    && candidate.prefixes.every((prefix) =>
      typeof prefix === "object"
      && prefix !== null
      && typeof prefix.originalPath === "string"
      && typeof prefix.bottleId === "string",
    )
    && typeof candidate.contract === "object"
    && candidate.contract !== null
    && candidate.contract.contractVersion === 1
    && typeof candidate.contract.schemas === "object"
    && candidate.contract.schemas !== null
    && is_valid_snapshot_location(candidate);
}

function is_valid_snapshot_location(returnPoint: Pick<StableReturnPoint, "id" | "dataRootPath" | "snapshotRootPath">): boolean {
  const expectedPath = path.resolve(returnPoint.dataRootPath, "Snapshots", returnPoint.id);

  return path.resolve(returnPoint.snapshotRootPath) === expectedPath;
}

function path_contains(parentPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(candidatePath));

  return relativePath === ""
    || (relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath));
}

export const snapshotManager = new SnapshotManager();
