import { WebContents } from "electron";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readSync, rmSync, statSync } from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { JADEITE_DEFAULT_VERSION, JADEITE_DOWNLOAD_URL } from "../../Common/Constant/RuntimeSources";
import {
  IPC_CHANNELS,
  JadeiteDeletePayload,
  JadeiteInstallPayload,
  JadeiteStatusPayload,
  RuntimeDeleteResultPayload,
} from "../../Common/Types/IPC";
import { JadeiteVersion } from "../../Common/Types/Wine";
import { downloadManager } from "./DownloadManager";
import { logManager } from "./LogManager";
import { preferenceManager } from "./PreferenceManager";

const JADEITE_CATALOG: JadeiteVersion[] = [
  {
    id: `jadeite-${JADEITE_DEFAULT_VERSION}`,
    name: `Jadeite ${JADEITE_DEFAULT_VERSION}`,
    version: JADEITE_DEFAULT_VERSION,
    status: "available",
    progress: 0,
    downloadUrl: JADEITE_DOWNLOAD_URL,
  },
];

/**
 * Downloads and extracts Jadeite runtime packages.
 *
 * Jadeite is currently used by the HoYo HSR launch strategy. Unlike DXMT, the
 * launcher needs the extracted directory that contains `jadeite.exe`, so this
 * manager validates the extracted runtime root before reporting installation.
 */
export class JadeiteManager {
  private readonly logger = logManager.createLogger({ file: "wine", source: "jadeite" });
  private cachedVersions: JadeiteVersion[] = [...JADEITE_CATALOG];
  private loadingVersions: Promise<JadeiteVersion[]> | null = null;

  async getVersionList(): Promise<JadeiteVersion[]> {
    if (this.loadingVersions) {
      return this.loadingVersions;
    }

    this.loadingVersions = this.loadVersionList();

    try {
      return await this.loadingVersions;
    } finally {
      this.loadingVersions = null;
    }
  }

  private async loadVersionList(): Promise<JadeiteVersion[]> {
    const preference = await preferenceManager.getPreference();
    const installRoot = get_default_jadeite_install_path(preference.dataRootPath);

    this.cachedVersions = JADEITE_CATALOG.map((version) => {
      const archivePath = version.downloadUrl
        ? get_download_target_path(installRoot, version.downloadUrl, `${version.id}.zip`)
        : undefined;
      const extractPath = get_extract_target_path(installRoot, version.version);
      const runtimePath = find_jadeite_runtime_root(extractPath);
      const isInstalled = Boolean(runtimePath);

      return {
        ...version,
        status: isInstalled ? "installed" : "available",
        progress: isInstalled ? 100 : 0,
        path: runtimePath,
        downloadUrl: version.downloadUrl ?? archivePath,
      };
    });

    return [...this.cachedVersions];
  }

  async installJadeite(request: JadeiteInstallPayload, sender?: WebContents): Promise<void> {
    const jadeite = this.cachedVersions.find((version) => version.id === request.versionId)
      ?? JADEITE_CATALOG.find((version) => version.id === request.versionId);

    if (!jadeite?.downloadUrl) {
      throw new Error(`Jadeite version has no downloadable asset: ${request.versionId}`);
    }

    const archivePath = get_download_target_path(request.installPath, jadeite.downloadUrl, `${request.versionId}.zip`);
    const extractPath = get_extract_target_path(request.installPath, jadeite.version);
    const existingRuntimePath = find_jadeite_runtime_root(extractPath);

    if (existingRuntimePath) {
      this.updateCachedVersion(request.versionId, {
        status: "installed",
        progress: 100,
        path: existingRuntimePath,
      });
      this.sendStatus(sender, {
        versionId: request.versionId,
        status: "installed",
        progress: 100,
        message: `${request.versionId} is already installed.`,
        path: existingRuntimePath,
      });
      return;
    }

    this.logger.info("install started", request);
    this.sendStatus(sender, {
      versionId: request.versionId,
      status: "downloading",
      progress: 1,
      message: `${request.versionId} download started.`,
    });

    try {
      mkdirSync(expand_user_home_path(request.installPath), { recursive: true });

      if (existsSync(archivePath) && !is_downloaded_zip_archive(archivePath)) {
        rmSync(archivePath, { force: true });
      }

      if (!existsSync(archivePath)) {
        await new Promise<void>((resolve, reject) => {
          downloadManager.startDownload(
            `jadeite:${request.versionId}`,
            jadeite.downloadUrl!,
            {
              outputDir: expand_user_home_path(request.installPath),
              fileName: path.basename(archivePath),
            },
            {
              onProgress: (progress) => {
                this.sendStatus(sender, {
                  versionId: request.versionId,
                  status: "downloading",
                  progress,
                  message: `${request.versionId} downloading ${Math.round(progress)}%.`,
                });
              },
              onEnd: (success) => {
                if (!success) {
                  reject(new Error(`${request.versionId} download failed.`));
                  return;
                }

                resolve();
              },
              onError: reject,
            },
          );
        });
      }

      this.sendStatus(sender, {
        versionId: request.versionId,
        status: "extracting",
        progress: 92,
        message: `${request.versionId} extracting Jadeite runtime.`,
      });

      if (existsSync(extractPath)) {
        rmSync(extractPath, { recursive: true, force: true });
      }

      mkdirSync(extractPath, { recursive: true });
      await extract_zip_archive(archivePath, extractPath);

      const runtimePath = find_jadeite_runtime_root(extractPath);

      if (!runtimePath) {
        throw new Error(`${request.versionId} extracted, but jadeite.exe was not found.`);
      }

      this.updateCachedVersion(request.versionId, {
        status: "installed",
        progress: 100,
        path: runtimePath,
      });
      this.sendStatus(sender, {
        versionId: request.versionId,
        status: "installed",
        progress: 100,
        message: `${request.versionId} installation completed.`,
        path: runtimePath,
      });
      this.logger.info("install completed", { versionId: request.versionId, runtimePath });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sendStatus(sender, {
        versionId: request.versionId,
        status: "error",
        progress: 0,
        message,
      });
      this.logger.error("install failed", { versionId: request.versionId, error: message });
      throw error;
    }
  }

  async deleteJadeite(request: JadeiteDeletePayload): Promise<RuntimeDeleteResultPayload> {
    const jadeite = this.cachedVersions.find((version) => version.id === request.versionId)
      ?? JADEITE_CATALOG.find((version) => version.id === request.versionId);

    if (!jadeite?.downloadUrl && !jadeite?.path) {
      return {
        ok: false,
        deletedPaths: [],
        error: `Jadeite version is not managed by the launcher: ${request.versionId}`,
      };
    }

    const archivePath = jadeite.downloadUrl
      ? get_download_target_path(request.installPath, jadeite.downloadUrl, `${request.versionId}.zip`)
      : undefined;
    const extractPath = get_extract_target_path(request.installPath, jadeite.version);
    const cacheRoot = path.resolve(expand_user_home_path(request.installPath));
    const deleteTargets = [archivePath, extractPath, jadeite.path].filter(Boolean) as string[];
    const deletedPaths: string[] = [];

    try {
      for (const target of deleteTargets) {
        const resolvedPath = path.resolve(expand_user_home_path(target));

        if (!is_safe_cache_delete_path(resolvedPath, cacheRoot) || !existsSync(resolvedPath)) {
          continue;
        }

        rmSync(resolvedPath, { recursive: true, force: true });
        deletedPaths.push(resolvedPath);
      }

      this.updateCachedVersion(request.versionId, {
        status: "available",
        progress: 0,
        path: undefined,
      });

      return {
        ok: true,
        deletedPaths: [...new Set(deletedPaths)],
      };
    } catch (error) {
      return {
        ok: false,
        deletedPaths,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  clearRuntimeMetadata(): void {
    this.cachedVersions = this.cachedVersions.map((version) => ({
      ...version,
      status: "available",
      progress: 0,
      path: undefined,
    }));
  }

  private updateCachedVersion(versionId: string, patch: Partial<JadeiteVersion>): void {
    this.cachedVersions = this.cachedVersions.map((version) =>
      version.id === versionId ? { ...version, ...patch } : version,
    );
  }

  private sendStatus(sender: WebContents | undefined, payload: JadeiteStatusPayload): void {
    sender?.send(IPC_CHANNELS.JADEITE.STATUS_UPDATE.channelName, payload);
  }
}

function get_default_jadeite_install_path(dataRootPath: string): string {
  return path.join(expand_user_home_path(dataRootPath), "dependencies", "jadeite");
}

function get_download_target_path(outputDir: string, url: string, fallback: string): string {
  return path.join(expand_user_home_path(outputDir), file_name_from_url(url, fallback));
}

function get_extract_target_path(outputDir: string, version: string): string {
  return path.join(expand_user_home_path(outputDir), version);
}

function expand_user_home_path(targetPath: string): string {
  if (targetPath === "~") {
    return os.homedir();
  }

  if (targetPath.startsWith("~/")) {
    return path.join(os.homedir(), targetPath.slice(2));
  }

  return targetPath;
}

function file_name_from_url(url: string, fallback: string): string {
  try {
    const pathname = new URL(url).pathname;
    return decodeURIComponent(pathname.split("/").pop() || fallback);
  } catch {
    return fallback;
  }
}

function is_safe_cache_delete_path(targetPath: string, cacheRoot: string): boolean {
  const parsed = path.parse(targetPath);

  return targetPath !== parsed.root
    && targetPath !== cacheRoot
    && targetPath.startsWith(`${cacheRoot}${path.sep}`);
}

function is_downloaded_zip_archive(targetPath: string): boolean {
  try {
    const stats = statSync(targetPath);

    if (!stats.isFile() || stats.size <= 0) {
      return false;
    }

    const header = read_file_header(targetPath, 4);
    return header[0] === 0x50 && header[1] === 0x4b;
  } catch {
    return false;
  }
}

function read_file_header(targetPath: string, length: number): Buffer {
  const fd = openSync(targetPath, "r");
  const buffer = Buffer.alloc(length);

  try {
    readSync(fd, buffer, 0, length, 0);
    return buffer;
  } finally {
    closeSync(fd);
  }
}

async function extract_zip_archive(archivePath: string, extractPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ditto", ["-x", "-k", archivePath, extractPath], {
      stdio: "ignore",
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`ditto exited with code ${code ?? "unknown"}.`));
    });
  });
}

function find_jadeite_runtime_root(rootPath: string, depth = 0): string | undefined {
  if (depth > 4) {
    return undefined;
  }

  try {
    const expandedRoot = expand_user_home_path(rootPath);

    if (!existsSync(expandedRoot) || !statSync(expandedRoot).isDirectory()) {
      return undefined;
    }

    if (existsSync(path.join(expandedRoot, "jadeite.exe"))) {
      return expandedRoot;
    }

    for (const entry of readdirSync(expandedRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const match = find_jadeite_runtime_root(path.join(expandedRoot, entry.name), depth + 1);

      if (match) {
        return match;
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export const jadeiteManager = new JadeiteManager();
