import { app, BrowserWindow, dialog, ipcMain, OpenDialogOptions, shell } from "electron";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { readdir, rm } from "fs/promises";
import os from "os";
import path from "path";
import { ApplyBottleRecipePayload, DeleteBottleAppPayload, DeleteBottleAppResultPayload, DeleteBottlePayload, DeleteBottlePrefixPayload, DeleteBottlePrefixResultPayload, DeleteBottleResultPayload, DeleteLauncherDataPayload, DeleteLauncherDataResultPayload, DownloadBottleLauncherInstallerPayload, DxmtDeletePayload, InstallBottleLauncherPayload, IPC_CHANNELS, InstallRequest, JadeiteDeletePayload, JadeiteInstallPayload, LauncherDataDeleteTarget, LauncherPreferencePatch, LocaleResourcesPayload, OpenExternalUrlPayload, OpenPathPayload, OpenPathResultPayload, PathSuggestionPayload, PathSuggestionResultPayload, RendererLogPayload, RosettaStatusPayload, RunBottleExecutablePayload, RunBottleExecutableResultPayload, RuntimeDeleteResultPayload, SelectDirectoryPayload, SelectFilePayload, SetupBottlePrefixPayload, StopBottleProcessPayload, WineDeletePayload } from "../../Common/Types/IPC";
import {
  get_bottle_registry_path,
  get_default_bottle_prefix_path,
  get_default_dxmt_cache_path,
  get_default_log_dir,
  get_default_wine_install_path,
  get_legacy_app_data_roots,
  get_legacy_bottle_prefix_paths,
  get_legacy_settings_dir,
  get_settings_path,
} from "../Environment/AppPaths";
import { apply_localized_app_name } from "../Environment/AppIdentity";
import { preferenceManager, PreferenceManager } from "./PreferenceManager";
import { bottleManager, BottleManager } from "./BottleManager";
import { bottleExecutionManager, BottleExecutionManager } from "./BottleExecutionManager";
import { dxmtManager, DxmtManager } from "./DxmtManager";
import { jadeiteManager, JadeiteManager } from "./JadeiteManager";
import { log_level_from_preference, logManager } from "./LogManager";
import { updateManager, UpdateManager } from "./UpdateManager";
import { windowManager, WindowManager } from "./WindowManager";
import { wineManager, WineManager } from "./WineManager";
import { youtubeManager, YouTubeManager } from "./YouTubeManager";
import { rosettaManager, RosettaManager } from "./RosettaManager";
import { send_to_web_contents } from "../Util/SafeWebContents";

/**
 * Owns every Electron IPC boundary used by the launcher.
 *
 * Renderer code must never call manager classes directly. It goes through the
 * typed bridge exposed by `src/Preload/preload.ts`, and this class translates
 * those channel calls into main-process manager work.
 *
 * @see ../../Preload/preload.ts for the renderer-facing IPC bridge.
 * @see ../../Common/Types/IPC.ts for channel names and payload contracts.
 */
export class IPCManager {
  private initialized = false;

  constructor(
    private readonly windows: WindowManager,
    private readonly wines: WineManager,
    private readonly dxmts: DxmtManager,
    private readonly jadeites: JadeiteManager,
    private readonly bottles: BottleManager,
    private readonly bottleExecutions: BottleExecutionManager,
    private readonly updates: UpdateManager,
    private readonly preferences: PreferenceManager,
    private readonly youtube: YouTubeManager,
    private readonly rosettas: RosettaManager,
  ) {}

  init(): void {
    if (this.initialized) {
      return;
    }

    this.initWineIPC();
    this.initDxmtIPC();
    this.initJadeiteIPC();
    this.initBottleIPC();
    this.initAppIPC();
    this.initLogIPC();
    this.initPreferenceIPC();
    this.initYouTubeIPC();
    this.initialized = true;
  }

  private initWineIPC(): void {
    ipcMain.removeHandler(IPC_CHANNELS.WINE.GET_VERSION_LIST.channelName);
    ipcMain.handle(IPC_CHANNELS.WINE.GET_VERSION_LIST.channelName, async () => {
      return this.wines.getVersionList();
    });

    ipcMain.removeHandler(IPC_CHANNELS.WINE.INSTALL.channelName);
    ipcMain.handle(
      IPC_CHANNELS.WINE.INSTALL.channelName,
      async (event, request: InstallRequest) => {
        await this.wines.installWine(request, event.sender);
      },
    );

    ipcMain.removeHandler(IPC_CHANNELS.WINE.DELETE.channelName);
    ipcMain.handle(
      IPC_CHANNELS.WINE.DELETE.channelName,
      async (_event, request: WineDeletePayload): Promise<RuntimeDeleteResultPayload> => {
        return this.wines.deleteWine(request);
      },
    );
  }

  private initDxmtIPC(): void {
    ipcMain.removeHandler(IPC_CHANNELS.DXMT.GET_VERSION_LIST.channelName);
    ipcMain.handle(IPC_CHANNELS.DXMT.GET_VERSION_LIST.channelName, async () => {
      return this.dxmts.getVersionList();
    });

    ipcMain.removeHandler(IPC_CHANNELS.DXMT.INSTALL.channelName);
    ipcMain.handle(
      IPC_CHANNELS.DXMT.INSTALL.channelName,
      async (event, request) => {
        await this.dxmts.installDxmt(request, event.sender);
      },
    );

    ipcMain.removeHandler(IPC_CHANNELS.DXMT.DELETE.channelName);
    ipcMain.handle(
      IPC_CHANNELS.DXMT.DELETE.channelName,
      async (_event, request: DxmtDeletePayload): Promise<RuntimeDeleteResultPayload> => {
        return this.dxmts.deleteDxmt(request);
      },
    );
  }

  private initJadeiteIPC(): void {
    ipcMain.removeHandler(IPC_CHANNELS.JADEITE.GET_VERSION_LIST.channelName);
    ipcMain.handle(IPC_CHANNELS.JADEITE.GET_VERSION_LIST.channelName, async () => {
      return this.jadeites.getVersionList();
    });

    ipcMain.removeHandler(IPC_CHANNELS.JADEITE.INSTALL.channelName);
    ipcMain.handle(
      IPC_CHANNELS.JADEITE.INSTALL.channelName,
      async (event, request: JadeiteInstallPayload) => {
        await this.jadeites.installJadeite(request, event.sender);
      },
    );

    ipcMain.removeHandler(IPC_CHANNELS.JADEITE.DELETE.channelName);
    ipcMain.handle(
      IPC_CHANNELS.JADEITE.DELETE.channelName,
      async (_event, request: JadeiteDeletePayload): Promise<RuntimeDeleteResultPayload> => {
        return this.jadeites.deleteJadeite(request);
      },
    );
  }

  private initBottleIPC(): void {
    ipcMain.removeHandler(IPC_CHANNELS.BOTTLE.GET_LIST.channelName);
    ipcMain.handle(IPC_CHANNELS.BOTTLE.GET_LIST.channelName, async () => {
      return this.bottles.getBottleList(true);
    });

    ipcMain.removeHandler(IPC_CHANNELS.BOTTLE.SAVE_LIST.channelName);
    ipcMain.handle(IPC_CHANNELS.BOTTLE.SAVE_LIST.channelName, async (_event, request) => {
      return this.bottles.saveBottleList(request);
    });

    // Bottle deletion is intentionally routed through BottleManager instead of
    // deleting paths here. BottleManager knows about registry tombstones, prefix
    // metadata, and bottle-scoped log cleanup.
    ipcMain.removeHandler(IPC_CHANNELS.BOTTLE.DELETE.channelName);
    ipcMain.handle(
      IPC_CHANNELS.BOTTLE.DELETE.channelName,
      async (_event, request: DeleteBottlePayload): Promise<DeleteBottleResultPayload> => {
        return this.bottles.deleteBottle(request);
      },
    );

    ipcMain.removeHandler(IPC_CHANNELS.BOTTLE.DELETE_APP.channelName);
    ipcMain.handle(
      IPC_CHANNELS.BOTTLE.DELETE_APP.channelName,
      async (_event, request: DeleteBottleAppPayload): Promise<DeleteBottleAppResultPayload> => {
        return this.bottles.deleteBottleApp(request);
      },
    );

    ipcMain.removeHandler(IPC_CHANNELS.BOTTLE.DELETE_PREFIX.channelName);
    ipcMain.handle(
      IPC_CHANNELS.BOTTLE.DELETE_PREFIX.channelName,
      async (_event, request: DeleteBottlePrefixPayload): Promise<DeleteBottlePrefixResultPayload> => {
        return this.bottles.deleteBottlePrefix(request);
      },
    );

    ipcMain.removeHandler(IPC_CHANNELS.BOTTLE.RUN_EXECUTABLE.channelName);
    ipcMain.handle(
      IPC_CHANNELS.BOTTLE.RUN_EXECUTABLE.channelName,
      async (event, request: RunBottleExecutablePayload): Promise<RunBottleExecutableResultPayload> => {
        return this.bottleExecutions.runExecutable(request, event.sender);
      },
    );

    ipcMain.removeHandler(IPC_CHANNELS.BOTTLE.STOP_PROCESS.channelName);
    ipcMain.handle(
      IPC_CHANNELS.BOTTLE.STOP_PROCESS.channelName,
      async (_event, request: StopBottleProcessPayload) => {
        await this.bottleExecutions.stopProcess(request.processId);
        return { ok: true };
      },
    );

    ipcMain.removeHandler(IPC_CHANNELS.BOTTLE.SETUP_PREFIX.channelName);
    ipcMain.handle(
      IPC_CHANNELS.BOTTLE.SETUP_PREFIX.channelName,
      async (event, request: SetupBottlePrefixPayload) => {
        return this.bottleExecutions.setupPrefix(request, event.sender);
      },
    );

    ipcMain.removeHandler(IPC_CHANNELS.BOTTLE.APPLY_RECIPE.channelName);
    ipcMain.handle(
      IPC_CHANNELS.BOTTLE.APPLY_RECIPE.channelName,
      async (event, request: ApplyBottleRecipePayload) => {
        const result = await this.bottleExecutions.applyRecipe(request, event.sender);

        this.bottles.clearCache();
        return result;
      },
    );

    ipcMain.removeHandler(IPC_CHANNELS.BOTTLE.DOWNLOAD_LAUNCHER_INSTALLER.channelName);
    ipcMain.handle(
      IPC_CHANNELS.BOTTLE.DOWNLOAD_LAUNCHER_INSTALLER.channelName,
      async (event, request: DownloadBottleLauncherInstallerPayload) => {
        const result = await this.bottleExecutions.downloadLauncherInstaller(request, event.sender);

        this.bottles.clearCache();
        return result;
      },
    );

    ipcMain.removeHandler(IPC_CHANNELS.BOTTLE.INSTALL_LAUNCHER.channelName);
    ipcMain.handle(
      IPC_CHANNELS.BOTTLE.INSTALL_LAUNCHER.channelName,
      async (event, request: InstallBottleLauncherPayload) => {
        const result = await this.bottleExecutions.installLauncher(request, event.sender);

        this.bottles.clearCache();
        return result;
      },
    );
  }

  private initAppIPC(): void {
    this.onAppEvent(IPC_CHANNELS.APP.QUIT.channelName, () => {
      void this.windows.requestQuitOrHideToTray();
    });

    this.onAppEvent(IPC_CHANNELS.APP.MINIMIZE.channelName, (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      window?.minimize();
    });

    this.onAppEvent(IPC_CHANNELS.APP.MAXIMIZE.channelName, (event) => {
      const window =
        BrowserWindow.fromWebContents(event.sender) ?? this.windows.getMainWindow();

      if (!window) {
        return;
      }

      if (window.isMaximized()) {
        window.unmaximize();
        return;
      }

      window.maximize();
    });

    this.onAppEvent(IPC_CHANNELS.APP.RESTART.channelName, () => {
      app.relaunch();
      app.quit();
    });

    this.onAppEvent(IPC_CHANNELS.APP.UPDATE.channelName, async (event) => {
      const window =
        BrowserWindow.fromWebContents(event.sender) ?? this.windows.getMainWindow();
      await this.updates.checkForUpdatesAndNotify(window ?? undefined);
    });

    ipcMain.removeHandler(IPC_CHANNELS.APP.GET_ROSETTA_STATUS.channelName);
    ipcMain.handle(IPC_CHANNELS.APP.GET_ROSETTA_STATUS.channelName, async (): Promise<RosettaStatusPayload> => {
      return this.rosettas.getStatus();
    });

    ipcMain.removeHandler(IPC_CHANNELS.APP.CONTINUE_AFTER_ROSETTA_GATE.channelName);
    ipcMain.handle(IPC_CHANNELS.APP.CONTINUE_AFTER_ROSETTA_GATE.channelName, async (): Promise<RosettaStatusPayload> => {
      const status = await this.rosettas.getStatus();

      if (status.status !== "missing") {
        this.windows.releaseRosettaGate();
      }

      return status;
    });

    ipcMain.removeHandler(IPC_CHANNELS.APP.GET_LOCALE_RESOURCES.channelName);
    ipcMain.handle(IPC_CHANNELS.APP.GET_LOCALE_RESOURCES.channelName, async (): Promise<LocaleResourcesPayload> => {
      return readLocaleResources();
    });

    ipcMain.removeHandler(IPC_CHANNELS.APP.OPEN_LOG_FOLDER.channelName);
    ipcMain.handle(IPC_CHANNELS.APP.OPEN_LOG_FOLDER.channelName, async (): Promise<OpenPathResultPayload> => {
      return this.openPath(path.dirname(logManager.getSessionDir()));
    });

    ipcMain.removeHandler(IPC_CHANNELS.APP.OPEN_PATH.channelName);
    ipcMain.handle(
      IPC_CHANNELS.APP.OPEN_PATH.channelName,
      async (_event, request: OpenPathPayload = {}): Promise<OpenPathResultPayload> => {
        return this.openPath(request.path);
      },
    );

    ipcMain.removeHandler(IPC_CHANNELS.APP.REVEAL_PATH.channelName);
    ipcMain.handle(
      IPC_CHANNELS.APP.REVEAL_PATH.channelName,
      async (_event, request: OpenPathPayload = {}): Promise<OpenPathResultPayload> => {
        return this.revealPath(request.path);
      },
    );

    ipcMain.removeHandler(IPC_CHANNELS.APP.OPEN_EXTERNAL_URL.channelName);
    ipcMain.handle(
      IPC_CHANNELS.APP.OPEN_EXTERNAL_URL.channelName,
      async (_event, request: OpenExternalUrlPayload): Promise<OpenPathResultPayload> => {
        return this.openExternalUrl(request.url);
      },
    );
  }

  private initLogIPC(): void {
    this.onAppEvent(IPC_CHANNELS.APP.RENDERER_LOG.channelName, (_event, payload: RendererLogPayload) => {
      logManager.rendererLog(payload);
    });

    ipcMain.removeHandler(IPC_CHANNELS.APP.GET_LOG_SNAPSHOT.channelName);
    ipcMain.handle(IPC_CHANNELS.APP.GET_LOG_SNAPSHOT.channelName, async () => {
      return logManager.getSnapshot();
    });

    logManager.onEntry((entry) => {
      const window = this.windows.getMainWindow();

      if (!window || window.isDestroyed()) {
        return;
      }

      send_to_web_contents(window.webContents, IPC_CHANNELS.APP.LOG_UPDATE.channelName, entry);
    });
  }

  private initPreferenceIPC(): void {
    ipcMain.removeHandler(IPC_CHANNELS.APP.GET_PREFERENCE.channelName);
    ipcMain.handle(IPC_CHANNELS.APP.GET_PREFERENCE.channelName, async () => {
      return this.preferences.getPreference();
    });

    ipcMain.removeHandler(IPC_CHANNELS.APP.UPDATE_PREFERENCE.channelName);
    ipcMain.handle(
      IPC_CHANNELS.APP.UPDATE_PREFERENCE.channelName,
      async (_event, patch: LauncherPreferencePatch) => {
        const preference = await this.preferences.updatePreference(patch);

        if (
          Object.prototype.hasOwnProperty.call(patch, "dataRootPath")
          || Object.prototype.hasOwnProperty.call(patch, "bottlePrefixPath")
        ) {
          this.bottles.clearCache();
        }

        apply_localized_app_name(preference.language);
        logManager.setMinLevel(log_level_from_preference(preference.appLoggingLevel));
        return preference;
      },
    );

    ipcMain.removeHandler(IPC_CHANNELS.APP.SELECT_DIRECTORY.channelName);
    ipcMain.handle(
      IPC_CHANNELS.APP.SELECT_DIRECTORY.channelName,
      async (event, request: SelectDirectoryPayload) => {
        const window =
          BrowserWindow.fromWebContents(event.sender) ?? this.windows.getMainWindow();
        const defaultPath = request?.defaultPath
          ? this.expandUserHomePath(request.defaultPath)
          : undefined;
        const options: OpenDialogOptions = {
          title: request?.title,
          defaultPath,
          properties: ["openDirectory", "createDirectory"],
        };
        const result = window
          ? await dialog.showOpenDialog(window, options)
          : await dialog.showOpenDialog(options);

        return {
          canceled: result.canceled,
          path: result.filePaths[0],
        };
      },
    );

    ipcMain.removeHandler(IPC_CHANNELS.APP.SELECT_FILE.channelName);
    ipcMain.handle(
      IPC_CHANNELS.APP.SELECT_FILE.channelName,
      async (event, request: SelectFilePayload = {}) => {
        const window =
          BrowserWindow.fromWebContents(event.sender) ?? this.windows.getMainWindow();
        const defaultPath = request?.defaultPath
          ? this.expandUserHomePath(request.defaultPath)
          : undefined;
        const options: OpenDialogOptions = {
          title: request?.title,
          defaultPath,
          filters: request?.filters,
          properties: ["openFile"],
        };
        const result = window
          ? await dialog.showOpenDialog(window, options)
          : await dialog.showOpenDialog(options);

        return {
          canceled: result.canceled,
          path: result.filePaths[0],
        };
      },
    );

    ipcMain.removeHandler(IPC_CHANNELS.APP.SUGGEST_PATHS.channelName);
    ipcMain.handle(
      IPC_CHANNELS.APP.SUGGEST_PATHS.channelName,
      async (_event, request: PathSuggestionPayload): Promise<PathSuggestionResultPayload> => {
        return this.suggestPaths(request);
      },
    );

    // Danger-zone deletion is a multi-manager operation. The filesystem paths
    // are deleted here, then related caches/registries are invalidated below so
    // renderer state does not resurrect deleted runtimes or bottles.
    ipcMain.removeHandler(IPC_CHANNELS.APP.DELETE_LAUNCHER_DATA.channelName);
    ipcMain.handle(
      IPC_CHANNELS.APP.DELETE_LAUNCHER_DATA.channelName,
      async (_event, request: DeleteLauncherDataPayload = {}): Promise<DeleteLauncherDataResultPayload> => {
        const preference = await this.preferences.getPreference();
        const targets = this.resolveDeleteTargets(request.targets);
        const candidatePaths = this.getLauncherDataDeletePaths(targets, request, preference);
        const uniquePaths = [...new Set(candidatePaths.filter((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0))];
        const result: DeleteLauncherDataResultPayload = {
          deletedPaths: [],
          skippedPaths: [],
          failedPaths: [],
        };

        for (const candidatePath of uniquePaths) {
          const resolvedPath = path.resolve(this.expandUserHomePath(candidatePath));

          if (!this.isSafeLauncherDataDeletePath(resolvedPath)) {
            result.skippedPaths.push({
              path: resolvedPath,
              reason: "Unsafe delete target",
            });
            continue;
          }

          try {
            await rm(resolvedPath, { recursive: true, force: true });
            result.deletedPaths.push(resolvedPath);
          } catch (error) {
            result.failedPaths.push({
              path: resolvedPath,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        if (result.failedPaths.length === 0 && targets.includes("bottlePrefixes")) {
          await this.bottles.clearAllBottleData();
        }

        if (result.failedPaths.length === 0 && targets.includes("wineRuntime")) {
          this.wines.clearRuntimeMetadata();
        }

        if (result.failedPaths.length === 0 && targets.includes("dxmtCache")) {
          this.dxmts.clearRuntimeMetadata();
        }

        if (result.failedPaths.length === 0 && (targets.includes("wineRuntime") || targets.includes("all"))) {
          this.jadeites.clearRuntimeMetadata();
        }

        // Deleted settings/runtime folders may still be represented in manager
        // caches. Clear/rebuild them before the renderer asks for fresh state.
        this.preferences.clearCache();
        return result;
      },
    );
  }

  private initYouTubeIPC(): void {
    ipcMain.removeHandler(IPC_CHANNELS.YOUTUBE.GET_LIVE_STATUS.channelName);
    ipcMain.handle(
      IPC_CHANNELS.YOUTUBE.GET_LIVE_STATUS.channelName,
      async (_event, request) => {
        return this.youtube.getLiveStatus(request);
      },
    );
  }

  private onAppEvent(
    channel: string,
    listener: Parameters<typeof ipcMain.on>[1],
  ): void {
    ipcMain.removeAllListeners(channel);
    ipcMain.on(channel, listener);
  }

  private isSafeLauncherDataDeletePath(targetPath: string): boolean {
    const homePath = path.resolve(os.homedir());
    const rootPath = path.parse(targetPath).root;

    if (targetPath === rootPath || targetPath === homePath) {
      return false;
    }

    return true;
  }

  private resolveDeleteTargets(targets?: LauncherDataDeleteTarget[]): LauncherDataDeleteTarget[] {
    if (!targets || targets.length === 0 || targets.includes("all")) {
      return ["wineRuntime", "bottlePrefixes", "dxmtCache", "settings", "logs"];
    }

    return [...new Set(targets)];
  }

  private getLauncherDataDeletePaths(
    targets: LauncherDataDeleteTarget[],
    request: DeleteLauncherDataPayload,
    preference: Awaited<ReturnType<PreferenceManager["getPreference"]>>,
  ): string[] {
    // The renderer sends the currently visible draft paths so deletion can use
    // unsaved UI values. Preference values are the fallback when the request is
    // triggered from another entry point.
    const paths: string[] = [];
    const dataRootPath = request.dataRootPath || preference.dataRootPath;

    if (targets.includes("wineRuntime")) {
      paths.push(
        request.wineInstallPath || get_default_wine_install_path(dataRootPath),
        preference.wineInstallPath,
        path.join(dataRootPath, "dependencies", "jadeite"),
        get_default_wine_install_path(),
        ...get_legacy_app_data_roots().map((root) => path.join(root, "Wine")),
      );
    }

    if (targets.includes("bottlePrefixes")) {
      paths.push(
        request.bottlePrefixPath || get_default_bottle_prefix_path(dataRootPath),
        preference.bottlePrefixPath,
        get_default_bottle_prefix_path(),
        ...get_legacy_bottle_prefix_paths(),
      );
    }

    if (targets.includes("dxmtCache")) {
      paths.push(
        request.dxmtCachePath || get_default_dxmt_cache_path(dataRootPath),
        preference.dxmtCachePath,
        get_default_dxmt_cache_path(),
        ...get_legacy_app_data_roots().map((root) => path.join(root, "DXMT")),
      );
    }

    if (targets.includes("settings")) {
      paths.push(
        get_settings_path(),
        get_bottle_registry_path(dataRootPath),
        get_bottle_registry_path(),
        get_legacy_settings_dir(),
      );
    }

    if (targets.includes("logs")) {
      paths.push(
        get_default_log_dir(dataRootPath),
        get_default_log_dir(),
      );
    }

    return paths;
  }

  private expandUserHomePath(targetPath: string): string {
    if (targetPath === "~") {
      return os.homedir();
    }

    if (targetPath.startsWith("~/")) {
      return path.join(os.homedir(), targetPath.slice(2));
    }

    return targetPath;
  }

  private async suggestPaths(request: PathSuggestionPayload = { value: "" }): Promise<PathSuggestionResultPayload> {
    const value = request.value?.trim() ?? "";
    const limit = request.limit === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(1, Math.min(1000, request.limit));
    const defaultPath = this.expandUserHomePath(request.defaultPath || os.homedir());
    const resolvedInput = this.resolvePathSuggestionInput(value, defaultPath);
    const hasTrailingSeparator = value.length === 0 || /[\\/]$/.test(value) || this.isDriveRootSuggestionInput(value);
    const directoryPath = hasTrailingSeparator
      ? resolvedInput.localPath
      : path.dirname(resolvedInput.localPath);
    const prefix = hasTrailingSeparator
      ? ""
      : path.basename(resolvedInput.localPath).toLowerCase();

    try {
      const entries = await readdir(directoryPath, { withFileTypes: true });
      const suggestions = entries
        .filter((entry) => entry.name.toLowerCase().startsWith(prefix))
        .sort((left, right) => {
          if (left.isDirectory() !== right.isDirectory()) {
            return left.isDirectory() ? -1 : 1;
          }

          return left.name.localeCompare(right.name);
        })
        .slice(0, limit)
        .map((entry) => {
          const targetPath = path.join(directoryPath, entry.name);

          return {
            path: this.formatPathSuggestion(targetPath, entry.isDirectory(), resolvedInput.mode, defaultPath),
            name: entry.name,
            isDirectory: entry.isDirectory(),
          };
        });

      return { suggestions };
    } catch {
      return { suggestions: [] };
    }
  }

  private resolvePathSuggestionInput(
    value: string,
    defaultPath: string,
  ): { localPath: string; mode: "local" | "z" | "c" } {
    if (/^z:?$/i.test(value)) {
      return {
        mode: "z",
        localPath: path.resolve("/"),
      };
    }

    if (/^z:(?:[\\/])?/i.test(value)) {
      const localPath = value
        .replace(/^z:(?:[\\/])?/i, "/")
        .replace(/\\/g, "/");

      return {
        mode: "z",
        localPath: path.resolve(localPath.startsWith("/") ? localPath : `/${localPath}`),
      };
    }

    if (/^c:?$/i.test(value)) {
      return {
        mode: "c",
        localPath: path.resolve(defaultPath, "drive_c"),
      };
    }

    if (/^c:(?:[\\/])?/i.test(value)) {
      const relativePath = value
        .replace(/^c:(?:[\\/])?/i, "")
        .replace(/[\\/]+/g, path.sep);

      return {
        mode: "c",
        localPath: path.resolve(defaultPath, "drive_c", relativePath),
      };
    }

    const expandedPath = value.length > 0 ? this.expandUserHomePath(value) : defaultPath;

    return {
      mode: "local",
      localPath: path.isAbsolute(expandedPath)
        ? path.resolve(expandedPath)
        : path.resolve(defaultPath, expandedPath),
    };
  }

  private isDriveRootSuggestionInput(value: string): boolean {
    return /^[cz]:?$/i.test(value.trim());
  }

  private formatPathSuggestion(
    targetPath: string,
    isDirectory: boolean,
    mode: "local" | "z" | "c",
    defaultPath: string,
  ): string {
    if (mode === "z") {
      const winePath = `Z:${targetPath.replace(/\//g, "\\")}`;
      return isDirectory && !winePath.endsWith("\\") ? `${winePath}\\` : winePath;
    }

    if (mode === "c") {
      const driveRoot = path.resolve(defaultPath, "drive_c");
      const relativePath = path.relative(driveRoot, targetPath).split(path.sep).join("\\");
      const winePath = relativePath ? `C:\\${relativePath}` : "C:\\";
      return isDirectory && !winePath.endsWith("\\") ? `${winePath}\\` : winePath;
    }

    return isDirectory && !targetPath.endsWith(path.sep) ? `${targetPath}${path.sep}` : targetPath;
  }

  private resolveLauncherPath(targetPath?: string): string {
    if (!targetPath || targetPath.trim().length === 0) {
      return get_default_log_dir();
    }

    const expandedPath = this.expandUserHomePath(targetPath);

    if (path.isAbsolute(expandedPath)) {
      return path.resolve(expandedPath);
    }

    return path.resolve(get_default_log_dir(), expandedPath);
  }

  private async openPath(targetPath?: string): Promise<OpenPathResultPayload> {
    const resolvedPath = this.resolveLauncherPath(targetPath);
    const existingPath = this.findExistingPath(resolvedPath);

    if (!existingPath) {
      return {
        ok: false,
        path: resolvedPath,
        error: "Path does not exist.",
      };
    }

    const error = await shell.openPath(existingPath);

    if (error) {
      shell.showItemInFolder(existingPath);
    }

    return {
      ok: error.length === 0,
      path: existingPath,
      error: error || (existingPath !== resolvedPath ? "Original path did not exist; opened the nearest existing parent." : undefined),
    };
  }

  private async revealPath(targetPath?: string): Promise<OpenPathResultPayload> {
    const resolvedPath = this.resolveLauncherPath(targetPath);
    const existingPath = this.findExistingPath(resolvedPath);

    if (!existingPath) {
      return {
        ok: false,
        path: resolvedPath,
        error: "Path does not exist.",
      };
    }

    if (this.isDirectoryPath(existingPath) && existingPath === resolvedPath) {
      const error = await shell.openPath(existingPath);

      if (error) {
        shell.showItemInFolder(existingPath);
      }

      return {
        ok: error.length === 0,
        path: existingPath,
        error: error || undefined,
      };
    }

    shell.showItemInFolder(existingPath);

    return {
      ok: true,
      path: existingPath,
      error: existingPath !== resolvedPath ? "Original path did not exist; revealed the nearest existing parent." : undefined,
    };
  }

  private findExistingPath(targetPath: string): string | undefined {
    let currentPath = targetPath;

    while (currentPath && currentPath !== path.dirname(currentPath)) {
      if (existsSync(currentPath)) {
        return currentPath;
      }

      currentPath = path.dirname(currentPath);
    }

    return existsSync(currentPath) ? currentPath : undefined;
  }

  private isDirectoryPath(targetPath: string): boolean {
    try {
      return statSync(targetPath).isDirectory();
    } catch {
      return false;
    }
  }

  private async openExternalUrl(url: string): Promise<OpenPathResultPayload> {
    if (!/^https?:\/\//i.test(url)) {
      return {
        ok: false,
        error: "Only http and https URLs can be opened externally.",
      };
    }

    await shell.openExternal(url);

    return {
      ok: true,
      path: url,
    };
  }
}

function readLocaleResources(): LocaleResourcesPayload {
  const resources: LocaleResourcesPayload = {};
  const localeRoots = [
    path.join(process.resourcesPath, "locales"),
    path.join(app.getAppPath(), "resouces", "locales"),
  ];

  for (const localeRoot of localeRoots) {
    if (!existsSync(localeRoot) || !statSync(localeRoot).isDirectory()) {
      continue;
    }

    for (const fileName of readdirSync(localeRoot)) {
      if (!fileName.endsWith(".json")) {
        continue;
      }

      try {
        const locale = path.basename(fileName, ".json");
        const resource = JSON.parse(readFileSync(path.join(localeRoot, fileName), "utf8"));

        if (resource && typeof resource === "object" && resource.translation && typeof resource.translation === "object") {
          resources[locale] = resource;
        }
      } catch {
        // Ignore malformed third-party locale files so one bad translation does
        // not stop the launcher from opening.
      }
    }
  }

  return resources;
}

export const ipcManager = new IPCManager(
  windowManager,
  wineManager,
  dxmtManager,
  jadeiteManager,
  bottleManager,
  bottleExecutionManager,
  updateManager,
  preferenceManager,
  youtubeManager,
  rosettaManager,
);
