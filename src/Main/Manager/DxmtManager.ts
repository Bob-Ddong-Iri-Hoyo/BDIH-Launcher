import { WebContents } from "electron";
import { existsSync } from "fs";
import os from "os";
import path from "path";
import { BDIH_DXMT_REPOSITORY } from "../../Common/Constant/RuntimeSources";
import { DxmtInstallPayload, DxmtStatusPayload, IPC_CHANNELS } from "../../Common/Types/IPC";
import { DxmtVersion } from "../../Common/Types/Wine";
import { fetch_github_release_catalog } from "../Runtime/GitHubReleaseCatalog";
import { downloadManager } from "./DownloadManager";
import { logManager } from "./LogManager";
import { preferenceManager } from "./PreferenceManager";

export class DxmtManager {
  private readonly logger = logManager.createLogger({ file: "wine", source: "dxmt" });
  private cachedVersions: DxmtVersion[] = [];

  async getVersionList(): Promise<DxmtVersion[]> {
    try {
      const preference = await preferenceManager.getPreference();
      const githubVersions = await fetch_github_release_catalog(BDIH_DXMT_REPOSITORY.releasesApiUrl, "bdih-dxmt");
      this.cachedVersions = githubVersions.map((version) => {
        const targetPath = version.downloadUrl
          ? get_download_target_path(preference.dxmtCachePath, version.downloadUrl, `${version.id}.zip`)
          : undefined;
        const isInstalled = Boolean(targetPath && existsSync(targetPath));

        return {
          ...version,
          name: `DXMT ${version.name}`,
          status: isInstalled ? "installed" : "available",
          progress: isInstalled ? 100 : 0,
          path: targetPath,
        };
      });
    } catch (error) {
      this.logger.warn("failed to load GitHub DXMT catalog", error);
      this.cachedVersions = [];
    }

    return [...this.cachedVersions];
  }

  async installDxmt(request: DxmtInstallPayload, sender?: WebContents): Promise<void> {
    const dxmt = this.cachedVersions.find((version) => version.id === request.versionId);

    if (!dxmt?.downloadUrl) {
      throw new Error(`DXMT version has no downloadable asset: ${request.versionId}`);
    }

    const targetPath = get_download_target_path(request.installPath, dxmt.downloadUrl, `${request.versionId}.zip`);

    if (existsSync(targetPath)) {
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
            if (!success) {
              this.sendStatus(sender, {
                versionId: request.versionId,
                status: "error",
                progress: 0,
                message: `${request.versionId} download failed.`,
              });
              reject(new Error(`${request.versionId} download failed.`));
              return;
            }

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
          },
          onError: reject,
        },
      );
    });
  }

  private sendStatus(sender: WebContents | undefined, payload: DxmtStatusPayload): void {
    sender?.send(IPC_CHANNELS.DXMT.STATUS_UPDATE.channelName, payload);
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

export const dxmtManager = new DxmtManager();
