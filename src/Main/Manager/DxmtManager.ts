import { WebContents } from "electron";
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readSync, rmSync, statSync } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { BDIH_DXMT_REPOSITORY } from "../../Common/Constant/RuntimeSources";
import { DxmtDeletePayload, DxmtInstallPayload, DxmtStatusPayload, IPC_CHANNELS, RuntimeDeleteResultPayload } from "../../Common/Types/IPC";
import { DxmtVersion } from "../../Common/Types/Wine";
import { remove_quarantine_xattr } from "../Program/Xattr";
import { fetch_github_release_catalog } from "../Runtime/GitHubReleaseCatalog";
import { downloadManager } from "./DownloadManager";
import { logManager } from "./LogManager";
import { preferenceManager } from "./PreferenceManager";

/**
 * Resolves and downloads DXMT package versions.
 *
 * DXMT is cached as downloaded package files rather than extracted runtimes, so
 * install status is based on whether the target archive exists on disk.
 */
export class DxmtManager {
  private readonly logger = logManager.createLogger({ file: "wine", source: "dxmt" });
  private cachedVersions: DxmtVersion[] = [];
  private loadingVersions: Promise<DxmtVersion[]> | null = null;

  async getVersionList(): Promise<DxmtVersion[]> {
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

  private async loadVersionList(): Promise<DxmtVersion[]> {
    // Recompute from the configured cache directory to avoid stale installed
    // status after the cache is deleted from Preferences.
    const preference = await preferenceManager.getPreference();

    try {
      const githubVersions = await fetch_github_release_catalog(BDIH_DXMT_REPOSITORY.releasesApiUrl, "bdih-dxmt");
      this.cachedVersions = githubVersions.map((version) => {
        const targetPath = version.downloadUrl
          ? get_download_target_path(preference.dxmtCachePath, version.downloadUrl, `${version.id}.zip`)
          : undefined;
        const isInstalled = Boolean(targetPath && is_downloaded_dxmt_package(targetPath));

        return {
          ...version,
          name: `DXMT ${version.name}`,
          status: isInstalled ? "installed" : "available",
          progress: isInstalled ? 100 : 0,
          path: isInstalled ? targetPath : undefined,
        };
      });
    } catch (error) {
      this.logger.warn("failed to load GitHub DXMT catalog", error);
      this.cachedVersions = [];
    }

    this.cachedVersions = with_dev_local_dxmt_versions(this.cachedVersions, preference.dxmtCachePath);
    return [...this.cachedVersions];
  }

  async installDxmt(request: DxmtInstallPayload, sender?: WebContents): Promise<void> {
    // Download progress is pushed to the renderer via DXMT.STATUS_UPDATE. The
    // target path is kept on the version so bottle recipes can reference it.
    const dxmt = this.cachedVersions.find((version) => version.id === request.versionId);

    if (!dxmt?.downloadUrl) {
      throw new Error(`DXMT version has no downloadable asset: ${request.versionId}`);
    }

    const targetPath = get_download_target_path(request.installPath, dxmt.downloadUrl, `${request.versionId}.zip`);

    if (existsSync(targetPath) && !is_downloaded_dxmt_package(targetPath)) {
      rmSync(targetPath, { recursive: true, force: true });
      this.logger.warn("removed invalid DXMT package before retry", {
        versionId: request.versionId,
        targetPath,
      });
    }

    if (is_downloaded_dxmt_package(targetPath)) {
      await this.clearQuarantineAttribute(request.versionId, targetPath);
      this.sendStatus(sender, {
        versionId: request.versionId,
        status: "installed",
        progress: 100,
        message: `${request.versionId} is already downloaded.`,
      });
      this.cachedVersions = this.cachedVersions.map((version) =>
        version.id === request.versionId
          ? { ...version, status: "installed", progress: 100, path: targetPath }
          : version,
      );
      return;
    }

    this.sendStatus(sender, {
      versionId: request.versionId,
      status: "downloading",
      progress: 1,
      message: `${request.versionId} download started.`,
    });

    const localPackagePath = local_file_path_from_url_or_path(dxmt.downloadUrl);

    if (localPackagePath) {
      mkdirSync(path.dirname(targetPath), { recursive: true });
      copyFileSync(localPackagePath, targetPath);

      await this.clearQuarantineAttribute(request.versionId, targetPath);
      this.sendStatus(sender, {
        versionId: request.versionId,
        status: "installed",
        progress: 100,
        message: `${request.versionId} download completed.`,
      });
      this.cachedVersions = this.cachedVersions.map((version) =>
        version.id === request.versionId
          ? { ...version, status: "installed", progress: 100, path: targetPath }
          : version,
      );
      return;
    }

    await new Promise<void>((resolve, reject) => {
      downloadManager.startDownload(
        `dxmt:${request.versionId}`,
        dxmt.downloadUrl!,
        {
          outputDir: expand_user_home_path(request.installPath),
          fileName: path.basename(targetPath),
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
            void (async () => {
            if (!success || !is_downloaded_dxmt_package(targetPath)) {
              if (existsSync(targetPath) && !is_downloaded_dxmt_package(targetPath)) {
                rmSync(targetPath, { recursive: true, force: true });
              }

              this.sendStatus(sender, {
                versionId: request.versionId,
                status: "error",
                progress: 0,
                message: `${request.versionId} download failed or produced an invalid package.`,
              });
              reject(new Error(`${request.versionId} download failed or produced an invalid package.`));
              return;
            }

            await this.clearQuarantineAttribute(request.versionId, targetPath);
            this.sendStatus(sender, {
              versionId: request.versionId,
              status: "installed",
              progress: 100,
              message: `${request.versionId} download completed.`,
            });
            this.cachedVersions = this.cachedVersions.map((version) =>
              version.id === request.versionId
                ? { ...version, status: "installed", progress: 100, path: targetPath }
                : version,
            );
            resolve();
            })().catch(reject);
          },
          onError: reject,
        },
      );
    });
  }

  async deleteDxmt(request: DxmtDeletePayload): Promise<RuntimeDeleteResultPayload> {
    const dxmt = this.cachedVersions.find((version) => version.id === request.versionId);

    if (!dxmt?.downloadUrl && !dxmt?.path) {
      return {
        ok: false,
        deletedPaths: [],
        error: `DXMT version is not managed by the launcher: ${request.versionId}`,
      };
    }

    const targetPath = dxmt.downloadUrl
      ? get_download_target_path(request.installPath, dxmt.downloadUrl, `${request.versionId}.zip`)
      : dxmt.path;
    const cacheRoot = path.resolve(expand_user_home_path(request.installPath));
    const resolvedPath = targetPath ? path.resolve(expand_user_home_path(targetPath)) : "";
    const deletedPaths: string[] = [];

    try {
      if (resolvedPath && is_safe_cache_delete_path(resolvedPath, cacheRoot) && existsSync(resolvedPath)) {
        rmSync(resolvedPath, { recursive: true, force: true });
        deletedPaths.push(resolvedPath);
      }

      this.cachedVersions = this.cachedVersions.map((version) =>
        version.id === request.versionId
          ? {
              ...version,
              status: "available",
              progress: 0,
              path: undefined,
            }
          : version,
      );

      return {
        ok: true,
        deletedPaths,
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
    // DXMT install state is cached archive metadata. After deleting the cache
    // folder, clear the in-memory path/status so the renderer does not keep
    // showing "already downloaded".
    this.cachedVersions = this.cachedVersions.map((version) => ({
      ...version,
      status: "available",
      progress: 0,
      path: undefined,
    }));
  }

  private sendStatus(sender: WebContents | undefined, payload: DxmtStatusPayload): void {
    sender?.send(IPC_CHANNELS.DXMT.STATUS_UPDATE.channelName, payload);
  }

  private async clearQuarantineAttribute(versionId: string, targetPath: string): Promise<void> {
    const result = await remove_quarantine_xattr(targetPath);

    if (result.skipped) {
      return;
    }

    if (result.ok) {
      this.logger.debug("removed quarantine xattr", { versionId, targetPath });
      return;
    }

    this.logger.warn("failed to remove quarantine xattr", {
      versionId,
      targetPath,
      error: result.error,
    });
  }
}

function get_download_target_path(outputDir: string, url: string, fallback: string): string {
  return path.join(expand_user_home_path(outputDir), file_name_from_url(url, fallback));
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

function is_downloaded_dxmt_package(targetPath: string): boolean {
  try {
    const stats = statSync(targetPath);

    if (!stats.isFile() || stats.size <= 0) {
      return false;
    }

    const header = read_file_header(targetPath, 6);

    if (/\.zip$/i.test(targetPath)) {
      return header[0] === 0x50 && header[1] === 0x4b;
    }

    if (/\.tar\.gz$/i.test(targetPath) || /\.tgz$/i.test(targetPath)) {
      return header[0] === 0x1f && header[1] === 0x8b;
    }

    if (/\.7z$/i.test(targetPath)) {
      return header[0] === 0x37
        && header[1] === 0x7a
        && header[2] === 0xbc
        && header[3] === 0xaf
        && header[4] === 0x27
        && header[5] === 0x1c;
    }

    return false;
  } catch {
    return false;
  }
}

function with_dev_local_dxmt_versions(versions: DxmtVersion[], installPath: string): DxmtVersion[] {
  const localVersion = resolve_dev_local_dxmt_version(installPath);

  if (!localVersion) {
    return versions;
  }

  return [
    localVersion,
    ...versions.filter((version) => version.id !== localVersion.id),
  ];
}

function resolve_dev_local_dxmt_version(installPath: string): DxmtVersion | undefined {
  const projectRoot = find_wine_project_root();

  if (!projectRoot) {
    return undefined;
  }

  const archivePath = [
    path.join(projectRoot, "er-dxmt-build", "artifacts", "dxmt-v0.80-builtin.tar.gz"),
    path.join(projectRoot, "Wine-build", "artifacts", "dxmt-v0.80-builtin.tar.gz"),
  ].find((candidatePath) => existsSync(candidatePath));

  if (!archivePath) {
    return undefined;
  }

  const downloadUrl = pathToFileURL(archivePath).toString();
  const targetPath = get_download_target_path(installPath, downloadUrl, "dxmt-v0.80-builtin.tar.gz");
  const isInstalled = is_downloaded_dxmt_package(targetPath);

  return {
    id: "local-dxmt-v0.80-builtin",
    name: "Local DXMT v0.80 Builtin",
    version: "0.80",
    downloadUrl,
    status: isInstalled ? "installed" : "available",
    progress: isInstalled ? 100 : 0,
    path: isInstalled ? targetPath : undefined,
  };
}

function find_wine_project_root(): string | undefined {
  const starts = [process.cwd(), __dirname];
  const seen = new Set<string>();

  for (const start of starts) {
    let current = path.resolve(start);

    for (let depth = 0; depth < 8; depth += 1) {
      if (seen.has(current)) {
        break;
      }

      seen.add(current);

      if (existsSync(path.join(current, "Wine-build", "artifacts"))) {
        return current;
      }

      const parent = path.dirname(current);

      if (parent === current) {
        break;
      }

      current = parent;
    }
  }

  return undefined;
}

function local_file_path_from_url_or_path(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);

    if (url.protocol === "file:") {
      return fileURLToPath(url);
    }

    return undefined;
  } catch {
    return path.isAbsolute(value) ? value : undefined;
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

export const dxmtManager = new DxmtManager();
