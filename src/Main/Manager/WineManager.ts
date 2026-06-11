import { WebContents } from "electron";
import { spawn } from "child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "fs";
import os from "os";
import path from "path";
import { PREDEFINED_WINE_VERSIONS } from "../../Common/Constant/WineCatalog";
import { BDIH_WINE_REPOSITORY } from "../../Common/Constant/RuntimeSources";
import {
  IPC_CHANNELS,
  InstallRequest,
  WineStatusPayload,
} from "../../Common/Types/IPC";
import { WineVersion } from "../../Common/Types/Wine";
import { fetch_github_release_catalog } from "../Runtime/GitHubReleaseCatalog";
import { downloadManager } from "./DownloadManager";
import { logManager } from "./LogManager";
import { preferenceManager } from "./PreferenceManager";

export class WineManager {
  private readonly logger = logManager.createLogger({ file: "wine", source: "wine" });
  private cachedVersions: WineVersion[] = [...PREDEFINED_WINE_VERSIONS];

  async getVersionList(): Promise<WineVersion[]> {
    try {
      const preference = await preferenceManager.getPreference();
      const githubVersions = await fetch_github_release_catalog(BDIH_WINE_REPOSITORY.releasesApiUrl, "bdih-wine");
      this.cachedVersions = githubVersions.map((version) => {
        const archivePath = version.downloadUrl
          ? get_download_target_path(preference.wineInstallPath, version.downloadUrl, `${version.id}.zip`)
          : undefined;
        const runtimePath = archivePath ? find_wine_runtime_root(get_extract_target_path(archivePath)) : undefined;
        const isInstalled = Boolean(runtimePath);

        return {
          ...version,
          name: `BDIH Wine ${version.name}`,
          type: "custom",
          status: isInstalled ? "installed" : "available",
          progress: isInstalled ? 100 : 0,
          path: runtimePath,
        };
      });
    } catch (error) {
      this.logger.warn("failed to load GitHub wine catalog, using fallback", error);
      this.cachedVersions = [...PREDEFINED_WINE_VERSIONS];
    }

    this.logger.debug("loaded wine version list", { count: this.cachedVersions.length });
    return [...this.cachedVersions];
  }

  async installWine(
    request: InstallRequest,
    sender?: WebContents,
  ): Promise<void> {
    const wine = this.cachedVersions.find((version) => version.id === request.versionId);

    if (!wine?.downloadUrl) {
      throw new Error(`Wine version has no downloadable asset: ${request.versionId}`);
    }

    const archivePath = get_download_target_path(request.installPath, wine.downloadUrl, `${request.versionId}.zip`);
    const extractPath = get_extract_target_path(archivePath);
    const existingRuntimePath = find_wine_runtime_root(extractPath);

    if (existingRuntimePath) {
      this.sendStatus(sender, {
        versionId: request.versionId,
        status: "installed",
        progress: 100,
        message: `${request.versionId} is already installed.`,
        path: existingRuntimePath,
      });
      this.cachedVersions = this.cachedVersions.map((version) =>
        version.id === request.versionId
          ? { ...version, status: "installed", progress: 100, path: existingRuntimePath }
          : version,
      );
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
      if (!existsSync(archivePath)) {
        await new Promise<void>((resolve, reject) => {
          downloadManager.startDownload(
            `wine:${request.versionId}`,
            wine.downloadUrl!,
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
        message: `${request.versionId} extracting Wine runtime.`,
      });

      await extract_wine_archive(archivePath, extractPath);
      const runtimePath = find_wine_runtime_root(extractPath);

      if (!runtimePath) {
        throw new Error(`${request.versionId} extracted, but wine/wine64 was not found.`);
      }

      this.sendStatus(sender, {
        versionId: request.versionId,
        status: "installed",
        progress: 100,
        message: `${request.versionId} installation completed.`,
        path: runtimePath,
      });
      this.cachedVersions = this.cachedVersions.map((version) =>
        version.id === request.versionId
          ? { ...version, status: "installed", progress: 100, path: runtimePath }
          : version,
      );
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

  private sendStatus(
    sender: WebContents | undefined,
    payload: WineStatusPayload,
  ): void {
    sender?.send(IPC_CHANNELS.WINE.STATUS_UPDATE.channelName, payload);
  }
}

function get_download_target_path(outputDir: string, url: string, fallback: string): string {
  return path.join(expand_user_home_path(outputDir), file_name_from_url(url, fallback));
}

function get_extract_target_path(archivePath: string): string {
  return archivePath
    .replace(/\.tar\.gz$/i, "")
    .replace(/\.tgz$/i, "")
    .replace(/\.zip$/i, "")
    .replace(/\.7z$/i, "")
    .replace(/\.dmg$/i, "");
}

function extract_wine_archive(archivePath: string, outputDir: string): Promise<void> {
  mkdirSync(outputDir, { recursive: true });

  if (/\.tar\.gz$/i.test(archivePath) || /\.tgz$/i.test(archivePath)) {
    return run_archive_command("tar", ["-xzf", archivePath, "-C", outputDir]);
  }

  if (/\.zip$/i.test(archivePath)) {
    return run_archive_command("ditto", ["-x", "-k", archivePath, outputDir]);
  }

  throw new Error(`Unsupported Wine archive type: ${path.basename(archivePath)}`);
}

function run_archive_command(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: "ignore",
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? -1}.`));
    });
    child.on("error", reject);
  });
}

function find_wine_runtime_root(candidatePath: string): string | undefined {
  const candidates = collect_wine_runtime_candidates(candidatePath, 0, 3);

  return candidates.find(is_wine_runtime_root);
}

function collect_wine_runtime_candidates(candidatePath: string, depth: number, maxDepth: number): string[] {
  if (!candidatePath || !existsSync(candidatePath)) {
    return [];
  }

  const candidates = [candidatePath];

  if (depth >= maxDepth || !is_directory(candidatePath)) {
    return candidates;
  }

  try {
    const entries = readdirSync(candidatePath);

    for (const entry of entries) {
      candidates.push(...collect_wine_runtime_candidates(path.join(candidatePath, entry), depth + 1, maxDepth));
    }
  } catch {
    return candidates;
  }

  return candidates;
}

function is_wine_runtime_root(candidatePath: string): boolean {
  return [
    path.join(candidatePath, "bin", "wine64"),
    path.join(candidatePath, "bin", "wine"),
    path.join(candidatePath, "Contents", "Resources", "wine", "bin", "wine64"),
    path.join(candidatePath, "Contents", "Resources", "wine", "bin", "wine"),
    path.join(candidatePath, "Contents", "MacOS", "wine64"),
    path.join(candidatePath, "Contents", "MacOS", "wine"),
  ].some(is_executable_file);
}

function is_directory(targetPath: string): boolean {
  try {
    return statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

function is_executable_file(targetPath: string): boolean {
  try {
    const stats = statSync(targetPath);
    return stats.isFile() && (stats.mode & 0o111) !== 0;
  } catch {
    return false;
  }
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

export const wineManager = new WineManager();
