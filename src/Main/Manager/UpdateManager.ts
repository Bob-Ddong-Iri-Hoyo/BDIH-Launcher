import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import {
  AppUpdateInstallProgressPayload,
  AppUpdateStatusPayload,
  IPC_CHANNELS,
  LauncherUpdateChannel,
} from "../../Common/Types/IPC";
import { logManager } from "./LogManager";
import { preferenceManager } from "./PreferenceManager";
import { send_to_web_contents } from "../Util/SafeWebContents";
import { is_nightly_update_test_build } from "../Environment/AppPaths";

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
  private window: BrowserWindow | null = null;
  private activeChannel: LauncherUpdateChannel = "stable";
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
    const channel = is_nightly_update_test_build()
      ? "nightly"
      : preference.updateChannel === "beta" ? "beta" : "stable";

    if (channel !== this.activeChannel) {
      // An available result belongs to the channel that produced it. Do not
      // offer a stale package after the user switches Stable/Beta channels.
      this.lastStatus = { status: "idle" };
    }

    this.activeChannel = channel;
    autoUpdater.channel = channel === "stable" ? "latest" : channel;
    autoUpdater.allowPrerelease = channel !== "stable";
  }

  private withRuntimeInfo(payload: AppUpdateStatusPayload): AppUpdateStatusPayload {
    return {
      ...payload,
      currentVersion: app.getVersion(),
      channel: this.activeChannel,
      channelLocked: is_nightly_update_test_build(),
    };
  }

  private describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

export const updateManager = new UpdateManager();
