import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import {
  AppUpdateStatusPayload,
  IPC_CHANNELS,
} from "../../Common/Types/IPC";
import { logManager } from "./LogManager";
import { send_to_web_contents } from "../Util/SafeWebContents";

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
  private window: BrowserWindow | null = null;
  private readonly logger = logManager.createLogger("UpdateManager");

  constructor(private readonly options: UpdateManagerOptions = {}) {}

  init(window?: BrowserWindow): void {
    if (window) {
      this.window = window;
    }

    if (this.initialized) {
      return;
    }

    autoUpdater.autoDownload = this.options.autoDownload ?? true;
    autoUpdater.autoInstallOnAppQuit = true;

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
      this.emitStatus({
        status: "downloading",
        progress: progress.percent ?? 0,
        message: "Downloading update.",
      });
    });

    autoUpdater.on("update-downloaded", (info: UpdateInfoLike) => {
      this.emitStatus({
        status: "downloaded",
        version: info.version,
        message: "Update has been downloaded.",
      });
    });

    autoUpdater.on("error", (error: Error) => {
      this.emitStatus({
        status: "error",
        error: error.message,
        message: "Update check failed.",
      });
    });

    this.initialized = true;
  }

  async checkForUpdatesAndNotify(window?: BrowserWindow): Promise<void> {
    this.init(window);

    if (!this.canCheckForUpdates()) {
      return;
    }

    try {
      await autoUpdater.checkForUpdatesAndNotify();
    } catch (error) {
      this.emitStatus({
        status: "error",
        error: this.describeError(error),
        message: "Update check failed.",
      });
    }
  }

  async checkForUpdates(window?: BrowserWindow): Promise<void> {
    this.init(window);

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

  quitAndInstall(): void {
    autoUpdater.quitAndInstall(false, true);
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
    this.logger.info(payload.status, payload.message ?? "");
    send_to_web_contents(this.window?.webContents, IPC_CHANNELS.APP.UPDATE_STATUS.channelName, payload);
  }

  private describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

export const updateManager = new UpdateManager();
