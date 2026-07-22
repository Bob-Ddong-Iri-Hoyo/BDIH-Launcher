import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import { readFile, rm } from "fs/promises";
import path from "path";
import {
  AppUpdateInstallProgressPayload,
  AppUpdateStatusPayload,
  IPC_CHANNELS,
  LauncherUpdateChannel,
} from "../../Common/Types/IPC";
import { BDIH_GITHUB_URL } from "../../Common/Constant/RuntimeSources";
import { logManager } from "./LogManager";
import { preferenceManager } from "./PreferenceManager";
import { snapshotManager } from "./SnapshotManager";
import { send_to_web_contents } from "../Util/SafeWebContents";
import {
  is_nightly_launcher_build,
  is_staging_launcher_build,
  is_update_test_build,
} from "../Environment/AppPaths";

interface UpdateInfoLike {
  version?: string;
}

interface ProgressInfoLike {
  percent?: number;
}

export interface UpdateManagerOptions {
  autoDownload?: boolean;
  allowPrerelease?: boolean;
  checkInDevelopment?: boolean;
}

export class UpdateManager {
  private initialized = false;
  private installRequested = false;
  private beforeInstallHandler: (() => Promise<void>) | null = null;
  private installProgressHandler: ((payload: AppUpdateInstallProgressPayload) => Promise<void> | void) | null = null;
  private installFailureHandler: (() => Promise<void> | void) | null = null;
  private installFailureNotified = false;
  private cachedUpdateCleanupComplete = false;
  private checkPromise: Promise<void> | null = null;
  private window: BrowserWindow | null = null;
  private activeChannel: LauncherUpdateChannel = "stable";
  private activePinnedStableVersion: string | undefined;
  private lastStatus: AppUpdateStatusPayload = { status: "idle" };
  private readonly logger = logManager.createLogger("UpdateManager");

  constructor(private readonly options: UpdateManagerOptions = {}) {}

  init(window?: BrowserWindow): void {
    if (window) {
      this.window = window;
    }

    if (this.initialized) {
      return;
    }

    // Checking only discovers an update. Downloading starts after the user
    // explicitly confirms the available-version dialog.
    autoUpdater.autoDownload = this.options.autoDownload ?? false;
    // Installation is explicit so Squirrel owns the complete quit → replace →
    // relaunch sequence instead of racing a manual Finder relaunch.
    autoUpdater.autoInstallOnAppQuit = false;

    if (this.options.allowPrerelease !== undefined) {
      autoUpdater.allowPrerelease = this.options.allowPrerelease;
    }

    autoUpdater.on("checking-for-update", () => {
      this.emitStatus({ status: "checking", message: "Checking for update." });
    });

    autoUpdater.on("update-available", (info: UpdateInfoLike) => {
      this.emitStatus({
        status: "available",
        version: info.version,
        message: "Update is available.",
      });
    });

    autoUpdater.on("update-not-available", (info: UpdateInfoLike) => {
      this.emitStatus({
        status: "not-available",
        version: info.version,
        message: "No update is available.",
      });
    });

    autoUpdater.on("download-progress", (progress: ProgressInfoLike) => {
      if (this.installRequested) {
        void this.reportInstallProgress({
          stage: "downloading",
          progress: 30 + this.clampProgress(progress.percent ?? 0) * 0.58,
        });
      }

      this.emitStatus({
        status: "downloading",
        version: this.lastStatus.version,
        progress: progress.percent ?? 0,
        message: "Downloading update.",
      });
    });

    autoUpdater.on("update-downloaded", (info: UpdateInfoLike) => {
      if (this.installRequested) {
        void this.reportInstallProgress({ stage: "installing", progress: 90 });
      }

      this.emitStatus({
        status: "downloaded",
        version: info.version,
        message: "Update has been downloaded.",
      });
    });

    autoUpdater.on("error", (error: Error) => {
      const wasInstalling = this.installRequested;
      this.installRequested = false;

      if (wasInstalling) {
        this.notifyInstallFailure();
      }

      this.emitStatus({
        status: "error",
        error: error.message,
        message: "Update check failed.",
      });
    });

    this.initialized = true;
  }

  async checkForUpdates(window?: BrowserWindow): Promise<void> {
    this.init(window);

    if (this.installRequested) {
      return;
    }

    if (this.checkPromise) {
      return this.checkPromise;
    }

    const checkPromise = this.performUpdateCheck();
    this.checkPromise = checkPromise;

    try {
      await checkPromise;
    } finally {
      if (this.checkPromise === checkPromise) {
        this.checkPromise = null;
      }
    }
  }

  private async performUpdateCheck(): Promise<void> {
    await this.cleanupIncompatibleNightlyUpdateCache();
    await this.configureUpdateChannel();

    if (!this.canCheckForUpdates()) {
      return;
    }

    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.emitStatus({
        status: "error",
        error: this.describeError(error),
        message: "Update check failed.",
      });
    }
  }

  /**
   * Checks once during launcher startup and immediately applies a discovered
   * update. Manual checks intentionally use checkForUpdates() instead so they
   * can wait for the user's Later/Update dialog choice.
   */
  async checkForUpdatesAndInstall(window?: BrowserWindow): Promise<void> {
    if (this.installRequested) {
      return;
    }

    await this.checkForUpdates(window);

    if (this.lastStatus.status === "available" || this.lastStatus.status === "downloaded") {
      await this.quitAndInstall();
    }
  }

  setBeforeInstallHandler(handler: () => Promise<void>): void {
    this.beforeInstallHandler = handler;
  }

  setInstallProgressHandler(
    handler: (payload: AppUpdateInstallProgressPayload) => Promise<void> | void,
  ): void {
    this.installProgressHandler = handler;
  }

  setInstallFailureHandler(handler: () => Promise<void> | void): void {
    this.installFailureHandler = handler;
  }

  isInstallingUpdate(): boolean {
    return this.installRequested;
  }

  async quitAndInstall(): Promise<void> {
    if (this.installRequested) {
      return;
    }

    if (this.lastStatus.status !== "available" && this.lastStatus.status !== "downloaded") {
      this.emitStatus({
        status: "error",
        error: "No available update is ready to install.",
        message: "Update installation could not start.",
      });
      return;
    }

    this.installRequested = true;
    this.installFailureNotified = false;

    try {
      await this.beforeInstallHandler?.();

      if (this.lastStatus.status !== "downloaded") {
        await this.reportInstallProgress({ stage: "downloading", progress: 30 });
        await autoUpdater.downloadUpdate();
      }

      if (this.lastStatus.status !== "downloaded") {
        throw new Error("The update download did not complete.");
      }

      await this.reportInstallProgress({ stage: "installing", progress: 96 });
      this.logger.info("installing", "Handing the downloaded update to the installer.", {
        channel: this.activeChannel,
      });
      autoUpdater.quitAndInstall(false, true);
    } catch (error) {
      const wasInstalling = this.installRequested;
      this.installRequested = false;

      if (wasInstalling) {
        this.notifyInstallFailure();
      }

      if (this.lastStatus.status !== "error") {
        this.emitStatus({
          status: "error",
          error: this.describeError(error),
          message: "Update installation could not start.",
        });
      }
    }
  }

  async getStatus(window?: BrowserWindow): Promise<AppUpdateStatusPayload> {
    this.init(window);
    await this.configureUpdateChannel();
    return this.withRuntimeInfo(this.lastStatus);
  }

  async reconfigureAfterChannelChange(window?: BrowserWindow): Promise<void> {
    this.init(window);

    // Let a check that belongs to the previous channel finish before replacing
    // its provider. Reconfiguring afterwards also clears any result emitted by
    // that stale check, so it cannot be offered under the newly selected
    // channel.
    const inFlightCheck = this.checkPromise;

    if (inFlightCheck) {
      await inFlightCheck;
    }

    await this.configureUpdateChannel();
  }

  private canCheckForUpdates(): boolean {
    if (app.isPackaged || this.options.checkInDevelopment) {
      return true;
    }

    this.emitStatus({
      status: "disabled",
      message: "Update checks are disabled outside packaged builds.",
    });
    return false;
  }

  private async cleanupIncompatibleNightlyUpdateCache(): Promise<void> {
    if (this.cachedUpdateCleanupComplete) {
      return;
    }

    this.cachedUpdateCleanupComplete = true;

    if (!is_nightly_launcher_build() || is_update_test_build()) {
      return;
    }

    const cacheRoot = app.getPath("cache");
    const pendingDirectory = path.join(cacheRoot, "bdih-launcher-nightly-updater", "pending");
    const updateInfoPath = path.join(pendingDirectory, "update-info.json");
    let cachedFileName = "";

    try {
      const updateInfo = JSON.parse(await readFile(updateInfoPath, "utf8")) as { fileName?: unknown };
      cachedFileName = typeof updateInfo.fileName === "string" ? updateInfo.fileName : "";

      if (cachedFileName.startsWith("BDIH-Launcher-Nightly-")) {
        return;
      }
    } catch (error) {
      if (
        typeof error === "object"
        && error !== null
        && "code" in error
        && error.code === "ENOENT"
      ) {
        return;
      }

      this.logger.warn("cache", "Nightly update cache metadata is invalid and will be cleared.", error);
    }

    try {
      await Promise.all([
        rm(pendingDirectory, { recursive: true, force: true }),
        rm(path.join(cacheRoot, "day.faby.bdih-launcher.nightly.ShipIt"), {
          recursive: true,
          force: true,
        }),
        rm(path.join(cacheRoot, "com.fabyday.bdih-launcher.nightly.ShipIt"), {
          recursive: true,
          force: true,
        }),
      ]);
      this.logger.warn("cache", "Cleared an incompatible pre-Nightly-identity update cache.", {
        cachedFileName,
      });
    } catch (error) {
      this.logger.warn("cache", "Failed to clear an incompatible Nightly update cache.", error);
    }
  }

  private emitStatus(payload: AppUpdateStatusPayload): void {
    const status = this.withRuntimeInfo(payload);
    this.lastStatus = status;
    this.logger.info(status.status, status.message ?? "", { channel: status.channel });
    send_to_web_contents(this.window?.webContents, IPC_CHANNELS.APP.UPDATE_STATUS.channelName, status);
  }

  private async reportInstallProgress(payload: AppUpdateInstallProgressPayload): Promise<void> {
    if (!this.installProgressHandler) {
      return;
    }

    try {
      await this.installProgressHandler({
        ...payload,
        progress: this.clampProgress(payload.progress),
      });
    } catch (error) {
      this.logger.warn("progress", "Failed to report update installation progress.", error);
    }
  }

  private notifyInstallFailure(): void {
    if (this.installFailureNotified || !this.installFailureHandler) {
      return;
    }

    this.installFailureNotified = true;

    try {
      void Promise.resolve(this.installFailureHandler()).catch((error) => {
        this.logger.warn("recovery", "Failed to recover the launcher after an update error.", error);
      });
    } catch (error) {
      this.logger.warn("recovery", "Failed to recover the launcher after an update error.", error);
    }
  }

  private clampProgress(progress: number): number {
    return Math.min(Math.max(progress, 0), 100);
  }

  private async configureUpdateChannel(): Promise<void> {
    const preference = await preferenceManager.getPreference();
    const channel = is_nightly_launcher_build()
      ? "nightly"
      : preference.updateChannel === "beta" ? "beta" : "stable";
    const returnPoint = channel === "stable"
      ? await snapshotManager.getActiveReturnPoint()
      : undefined;
    const pinnedStableVersion = returnPoint?.returnRequestedAt
      ? returnPoint.stableVersion
      : undefined;

    if (
      channel !== this.activeChannel
      || pinnedStableVersion !== this.activePinnedStableVersion
    ) {
      // An available result belongs to the channel that produced it. Do not
      // offer a stale package after the user switches channels or selects an
      // exact Stable return target.
      this.lastStatus = { status: "idle" };
    }

    this.activeChannel = channel;
    autoUpdater.channel = channel === "stable" ? "latest" : channel;
    autoUpdater.allowPrerelease = channel !== "stable";
    autoUpdater.allowDowngrade = channel === "stable"
      && (Boolean(pinnedStableVersion) || is_beta_app_version(app.getVersion()));

    if (pinnedStableVersion !== this.activePinnedStableVersion) {
      if (pinnedStableVersion) {
        autoUpdater.setFeedURL(pinned_stable_feed_url(pinnedStableVersion));
      } else if (this.activePinnedStableVersion) {
        restore_default_feed(channel);
      }

      this.activePinnedStableVersion = pinnedStableVersion;
    }
  }

  private withRuntimeInfo(payload: AppUpdateStatusPayload): AppUpdateStatusPayload {
    return {
      ...payload,
      currentVersion: app.getVersion(),
      channel: this.activeChannel,
      channelLocked: is_nightly_launcher_build(),
    };
  }

  private describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

function pinned_stable_feed_url(version: string): string {
  if (is_update_test_build()) {
    const configuredPort = process.env.BDIH_UPDATE_TEST_PORT?.trim();
    const port = configuredPort && /^\d+$/.test(configuredPort) ? configuredPort : "45678";

    return `http://127.0.0.1:${port}/builds/stable/${encodeURIComponent(version)}/`;
  }

  const repositoryUrl = is_staging_launcher_build()
    ? "https://github.com/Bob-Ddong-Iri-Hoyo/BDIH-Launcher-TestProduction"
    : BDIH_GITHUB_URL;
  const tag = is_staging_launcher_build()
    ? `v${version}+staging.stable`
    : `v${version}`;

  return `${repositoryUrl}/releases/download/${encodeURIComponent(tag)}/`;
}

function is_beta_app_version(version: string): boolean {
  return /^\d+\.\d+\.\d+-beta\.[0-9A-Za-z.-]+(?:\+[0-9A-Za-z.-]+)?$/.test(version.trim());
}

function restore_default_feed(channel: LauncherUpdateChannel): void {
  if (is_update_test_build()) {
    const configuredPort = process.env.BDIH_UPDATE_TEST_PORT?.trim();
    const port = configuredPort && /^\d+$/.test(configuredPort) ? configuredPort : "45678";

    autoUpdater.setFeedURL(`http://127.0.0.1:${port}/`);
    return;
  }

  autoUpdater.setFeedURL({
    provider: "github",
    owner: "Bob-Ddong-Iri-Hoyo",
    repo: is_staging_launcher_build()
      ? "BDIH-Launcher-TestProduction"
      : "BDIH-Launcher",
    channel: channel === "stable" ? "latest" : channel,
  });
}

export const updateManager = new UpdateManager();
