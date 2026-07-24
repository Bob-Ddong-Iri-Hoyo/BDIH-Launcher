import { WebContents } from "electron";
import { spawn } from "child_process";
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, readSync, rmSync, statSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { PREDEFINED_WINE_VERSIONS } from "../../Common/Constant/WineCatalog";
import { BDIH_WINE_REPOSITORY } from "../../Common/Constant/RuntimeSources";
import {
  IPC_CHANNELS,
  InstallRequest,
  RuntimeDeleteResultPayload,
  WineDeletePayload,
  WineStatusPayload,
} from "../../Common/Types/IPC";
import { WineLauncherOptionsManifest, WineVersion } from "../../Common/Types/Wine";
import { parse_wine_launcher_options_manifest } from "../../Common/Util/WineLauncherOptions";
import { remove_quarantine_xattr } from "../Program/Xattr";
import { fetch_github_release_catalog } from "../Runtime/GitHubReleaseCatalog";
import { ensure_runtime_artifact_receipt } from "../Runtime/RuntimeArtifactIdentity";
import { downloadManager } from "./DownloadManager";
import { logManager } from "./LogManager";
import { preferenceManager } from "./PreferenceManager";
import { send_to_web_contents } from "../Util/SafeWebContents";

/**
 * Resolves, downloads, and extracts Wine runtime versions.
 *
 * The renderer sees Wine versions through IPC. This manager owns the current
 * catalog cache so install status can be updated as download/extract events
 * arrive.
 */
export class WineManager {
  private readonly logger = logManager.createLogger({ file: "wine", source: "wine" });
  private cachedVersions: WineVersion[] = [...PREDEFINED_WINE_VERSIONS];
  private loadingVersions: Promise<WineVersion[]> | null = null;
  private readonly installingVersions = new Map<string, Promise<void>>();

  async getVersionList(): Promise<WineVersion[]> {
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

  private async loadVersionList(): Promise<WineVersion[]> {
    // Rebuild install status from disk each time the renderer asks. This keeps
    // Preference danger-zone deletion from leaving stale "installed" state.
    const preference = await preferenceManager.getPreference();

    try {
      const githubVersions = await fetch_github_release_catalog(BDIH_WINE_REPOSITORY.releasesApiUrl, "bdih-wine");
      this.cachedVersions = githubVersions.map((version) => {
        const archivePath = version.downloadUrl
          ? get_download_target_path(preference.wineInstallPath, version.downloadUrl, `${version.id}.zip`)
          : undefined;
        const runtimePath = archivePath ? find_wine_runtime_root(get_extract_target_path(archivePath)) : undefined;
        const metadataPath = archivePath
          ? get_wine_metadata_sidecar_path(preference.wineInstallPath, archivePath, version.metadataUrl, version.id)
          : undefined;
        const metadata = read_wine_launcher_options_metadata(runtimePath, metadataPath);
        const isInstalled = Boolean(runtimePath);

        return {
          ...version,
          name: `BDIH Wine ${version.name}`,
          type: "custom",
          status: isInstalled ? "installed" : "available",
          progress: isInstalled ? 100 : 0,
          path: runtimePath,
          metadataPath: metadata.path,
          launcherOptionsManifest: metadata.manifest,
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
    const installPath = path.resolve(expand_user_home_path(request.installPath));
    const installKey = `${request.versionId}:${installPath}`;
    const runningInstall = this.installingVersions.get(installKey);

    if (runningInstall) {
      this.logger.info("install already running", { versionId: request.versionId, installPath });
      this.sendStatus(sender, {
        versionId: request.versionId,
        status: "installing",
        progress: 5,
        message: `${request.versionId} installation is already running.`,
      });
      await runningInstall;
      return;
    }

    const installPromise = this.installWineUnlocked(
      {
        ...request,
        installPath,
      },
      sender,
    );

    this.installingVersions.set(installKey, installPromise);

    try {
      await installPromise;
    } finally {
      if (this.installingVersions.get(installKey) === installPromise) {
        this.installingVersions.delete(installKey);
      }
    }
  }

  private async installWineUnlocked(
    request: InstallRequest,
    sender?: WebContents,
  ): Promise<void> {
    // Installer progress is pushed to the renderer via WINE.STATUS_UPDATE. The
    // final runtime path is the extracted directory that actually contains Wine.
    const wine = this.cachedVersions.find((version) => version.id === request.versionId);

    if (!wine?.downloadUrl) {
      throw new Error(`Wine version has no downloadable asset: ${request.versionId}`);
    }

    const archivePath = get_download_target_path(request.installPath, wine.downloadUrl, `${request.versionId}.zip`);
    const extractPath = get_extract_target_path(archivePath);
    const existingRuntimePath = find_wine_runtime_root(extractPath);

    if (existingRuntimePath) {
      await this.clearQuarantineAttribute(request.versionId, existingRuntimePath);
      await ensure_runtime_artifact_receipt({
        kind: "wine",
        versionId: request.versionId,
        artifactPath: archivePath,
        receiptTargetPath: existingRuntimePath,
        sourceUrl: wine.downloadUrl,
      });
      const metadata = await this.ensureLauncherOptionsMetadata(wine, request.installPath, existingRuntimePath, sender);

      this.sendStatus(sender, {
        versionId: request.versionId,
        status: "installed",
        progress: 100,
        message: `${request.versionId} is already installed.`,
        path: existingRuntimePath,
        metadataPath: metadata.path,
        launcherOptionsManifest: metadata.manifest,
      });
      this.cachedVersions = this.cachedVersions.map((version) =>
        version.id === request.versionId
          ? {
              ...version,
              status: "installed",
              progress: 100,
              path: existingRuntimePath,
              metadataPath: metadata.path,
              launcherOptionsManifest: metadata.manifest,
            }
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
      if (existsSync(archivePath) && !is_probably_valid_runtime_archive(archivePath)) {
        rmSync(archivePath, { force: true });
        this.logger.warn("removed invalid Wine archive before retry", {
          versionId: request.versionId,
          archivePath,
        });
      }

      if (!existsSync(archivePath)) {
        const localArchivePath = local_file_path_from_url_or_path(wine.downloadUrl);

        if (localArchivePath) {
          mkdirSync(path.dirname(archivePath), { recursive: true });
          copyFileSync(localArchivePath, archivePath);
        } else {
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
      }

      await this.clearQuarantineAttribute(request.versionId, archivePath);

      this.sendStatus(sender, {
        versionId: request.versionId,
        status: "extracting",
        progress: 92,
        message: `${request.versionId} extracting Wine runtime.`,
      });

      if (existsSync(extractPath) && is_safe_runtime_delete_path(extractPath, request.installPath)) {
        rmSync(extractPath, { recursive: true, force: true });
      }

      try {
        await extract_wine_archive(archivePath, extractPath);
      } catch (error) {
        if (existsSync(archivePath)) {
          rmSync(archivePath, { force: true });
        }

        throw error;
      }
      const runtimePath = find_wine_runtime_root(extractPath);

      if (!runtimePath) {
        throw new Error(`${request.versionId} extracted, but wine/wine64 was not found.`);
      }

      await this.clearQuarantineAttribute(request.versionId, runtimePath);
      await ensure_runtime_artifact_receipt({
        kind: "wine",
        versionId: request.versionId,
        artifactPath: archivePath,
        receiptTargetPath: runtimePath,
        sourceUrl: wine.downloadUrl,
        force: true,
      });

      const metadata = await this.ensureLauncherOptionsMetadata(wine, request.installPath, runtimePath, sender);

      this.sendStatus(sender, {
        versionId: request.versionId,
        status: "installed",
        progress: 100,
        message: `${request.versionId} installation completed.`,
        path: runtimePath,
        metadataPath: metadata.path,
        launcherOptionsManifest: metadata.manifest,
      });
      this.cachedVersions = this.cachedVersions.map((version) =>
        version.id === request.versionId
          ? {
              ...version,
              status: "installed",
              progress: 100,
              path: runtimePath,
              metadataPath: metadata.path,
              launcherOptionsManifest: metadata.manifest,
            }
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

  async deleteWine(request: WineDeletePayload): Promise<RuntimeDeleteResultPayload> {
    const wine = this.cachedVersions.find((version) => version.id === request.versionId);

    if (!wine?.downloadUrl && !wine?.path) {
      return {
        ok: false,
        deletedPaths: [],
        error: `Wine version is not managed by the launcher: ${request.versionId}`,
      };
    }

    const archivePath = wine.downloadUrl
      ? get_download_target_path(request.installPath, wine.downloadUrl, `${request.versionId}.zip`)
      : undefined;
    const extractPath = archivePath ? get_extract_target_path(archivePath) : undefined;
    const metadataPath = archivePath
      ? get_wine_metadata_sidecar_path(request.installPath, archivePath, wine.metadataUrl, request.versionId)
      : wine.metadataPath;
    const installRoot = path.resolve(expand_user_home_path(request.installPath));
    const candidatePaths = unique_paths([
      extractPath,
      wine.path,
      archivePath,
      metadataPath,
    ].filter((candidate): candidate is string => Boolean(candidate)));
    const deletedPaths: string[] = [];

    try {
      for (const candidatePath of candidatePaths) {
        const resolvedPath = path.resolve(expand_user_home_path(candidatePath));

        if (!is_safe_runtime_delete_path(resolvedPath, installRoot) || !existsSync(resolvedPath)) {
          continue;
        }

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
              metadataPath: undefined,
              launcherOptionsManifest: undefined,
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
    // Called after runtime deletion. The files are already gone; this removes
    // the in-memory installed/path metadata that would otherwise survive until
    // the next full catalog rebuild.
    this.cachedVersions = this.cachedVersions.map((version) => ({
      ...version,
      status: "available",
      progress: 0,
      path: undefined,
      metadataPath: undefined,
      launcherOptionsManifest: undefined,
    }));
  }

  private async ensureLauncherOptionsMetadata(
    wine: WineVersion,
    installPath: string,
    runtimePath: string,
    sender?: WebContents,
  ): Promise<WineLauncherOptionsMetadata> {
    const archivePath = wine.downloadUrl
      ? get_download_target_path(installPath, wine.downloadUrl, `${wine.id}.zip`)
      : undefined;
    const sidecarPath = archivePath
      ? get_wine_metadata_sidecar_path(installPath, archivePath, wine.metadataUrl, wine.id)
      : undefined;

    if (wine.metadataUrl && sidecarPath && !existsSync(sidecarPath)) {
      this.sendStatus(sender, {
        versionId: wine.id,
        status: "extracting",
        progress: 96,
        message: `${wine.id} downloading launcher option metadata.`,
      });

      try {
        await download_wine_launcher_options_metadata(wine.metadataUrl, sidecarPath);
      } catch (error) {
        this.logger.warn("failed to download Wine launcher options metadata", {
          versionId: wine.id,
          metadataUrl: wine.metadataUrl,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return read_wine_launcher_options_metadata(runtimePath, sidecarPath);
  }

  private sendStatus(
    sender: WebContents | undefined,
    payload: WineStatusPayload,
  ): void {
    send_to_web_contents(sender, IPC_CHANNELS.WINE.STATUS_UPDATE.channelName, payload);
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

function get_wine_metadata_sidecar_path(
  outputDir: string,
  archivePath: string,
  metadataUrl: string | undefined,
  versionId: string,
): string {
  return metadataUrl
    ? get_download_target_path(outputDir, metadataUrl, `${versionId}.json`)
    : `${get_extract_target_path(archivePath)}.json`;
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
    let commandOutput = "";
    const appendOutput = (chunk: Buffer) => {
      commandOutput = `${commandOutput}${chunk.toString("utf8")}`.slice(-8000);
    };
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout?.on("data", appendOutput);
    child.stderr?.on("data", appendOutput);

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const output = commandOutput.trim();

      reject(new Error(`${command} exited with code ${code ?? -1}.${output ? ` ${output}` : ""}`));
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

function is_probably_valid_runtime_archive(archivePath: string): boolean {
  try {
    const stats = statSync(archivePath);

    if (!stats.isFile() || stats.size < 1024 * 1024) {
      return false;
    }

    const header = read_file_header(archivePath, 6);

    if (/\.zip$/i.test(archivePath)) {
      return header[0] === 0x50 && header[1] === 0x4b;
    }

    if (/\.tar\.gz$/i.test(archivePath) || /\.tgz$/i.test(archivePath)) {
      return header[0] === 0x1f && header[1] === 0x8b;
    }

    return true;
  } catch {
    return false;
  }
}

function is_safe_runtime_delete_path(targetPath: string, installRoot: string): boolean {
  const parsed = path.parse(targetPath);

  return targetPath !== parsed.root
    && targetPath !== installRoot
    && (targetPath === installRoot || targetPath.startsWith(`${installRoot}${path.sep}`));
}

function unique_paths(paths: string[]): string[] {
  return [...new Set(paths.map((targetPath) => path.resolve(expand_user_home_path(targetPath))))];
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

interface WineLauncherOptionsMetadata {
  path?: string;
  manifest?: WineLauncherOptionsManifest;
}

function read_wine_launcher_options_metadata(
  runtimePath?: string,
  sidecarPath?: string,
): WineLauncherOptionsMetadata {
  const candidatePaths = [
    ...wine_runtime_manifest_candidates(runtimePath),
    sidecarPath,
  ].filter((candidate, index, candidates): candidate is string =>
    Boolean(candidate) && candidates.indexOf(candidate) === index,
  );

  for (const candidatePath of candidatePaths) {
    try {
      const manifest = parse_wine_launcher_options_manifest(readFileSync(candidatePath, "utf8"));

      if (manifest) {
        return {
          path: candidatePath,
          manifest,
        };
      }
    } catch {
      // Metadata is optional. Invalid files are ignored so Wine itself remains usable.
    }
  }

  return {};
}

function wine_runtime_manifest_candidates(runtimePath?: string): string[] {
  if (!runtimePath) {
    return [];
  }

  return [
    path.join(runtimePath, "share", "bdhi", "launcher-options.json"),
    path.join(runtimePath, "Contents", "Resources", "wine", "share", "bdhi", "launcher-options.json"),
    path.join(runtimePath, "Contents", "Resources", "share", "bdhi", "launcher-options.json"),
  ];
}

async function download_wine_launcher_options_metadata(url: string, outputPath: string): Promise<void> {
  const localMetadataPath = local_file_path_from_url_or_path(url);

  if (localMetadataPath) {
    const raw = readFileSync(localMetadataPath, "utf8");

    if (!parse_wine_launcher_options_manifest(raw)) {
      throw new Error("Local Wine launcher metadata is not a supported manifest.");
    }

    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, raw, "utf8");
    return;
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "BDIH-Launcher",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download Wine launcher metadata: ${response.status} ${response.statusText}`);
  }

  const raw = await response.text();

  if (!parse_wine_launcher_options_manifest(raw)) {
    throw new Error("Downloaded Wine launcher metadata is not a supported manifest.");
  }

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, raw, "utf8");
}

export const wineManager = new WineManager();
