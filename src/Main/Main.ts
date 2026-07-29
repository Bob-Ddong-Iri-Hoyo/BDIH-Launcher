import { app, dialog, type MessageBoxOptions } from "electron";
import { config as load_dotenv_config } from "dotenv";
import { mkdirSync } from "fs";
import path from "path";
import { BDIH_YOUTUBE_HANDLE } from "../Common/Constant/RuntimeSources";
import { get_update_test_runtime_paths, is_nightly_launcher_build, is_staging_launcher_build, is_update_test_build } from "./Environment/AppPaths";
import { get_app_icon_path } from "./Environment/AppIcon";
import { apply_localized_app_name } from "./Environment/AppIdentity";
import { bottleManager } from "./Manager/BottleManager";
import { bottleExecutionManager } from "./Manager/BottleExecutionManager";
import { discordPresenceManager } from "./Manager/DiscordPresenceManager";
import { downloadManager } from "./Manager/DownloadManager";
import { ipcManager } from "./Manager/IPCManager";
import { log_level_from_preference, logManager } from "./Manager/LogManager";
import { preferenceManager } from "./Manager/PreferenceManager";
import { shortcutManager } from "./Manager/ShortcutManager";
import { updateManager } from "./Manager/UpdateManager";
import { windowManager } from "./Manager/WindowManager";
import { youtubeManager } from "./Manager/YouTubeManager";
import { channelTransitionManager } from "./Manager/ChannelTransitionManager";
import { guardianManager } from "./Manager/GuardianManager";
import { appDataMaintenanceManager } from "./Manager/AppDataMaintenanceManager";
import {
  PromiseTimeoutError,
  with_promise_timeout,
} from "./Util/PromiseTimeout";

// Main-process entry state used to make the asynchronous quit cleanup idempotent.
let isQuitCleanupComplete = false;
let quitCleanupPromise: Promise<void> | null = null;
let processProtectionPromise: Promise<void> | null = null;
let appCreationPromise: Promise<void> | null = null;
const UPDATE_INSTALL_HANDOFF_DELAY_MS = 350;
const QUIT_CLEANUP_TIMEOUT_MS = 20_000;
const IS_UPDATE_TEST_BUILD = is_update_test_build();
const IS_NIGHTLY_BUILD = is_nightly_launcher_build();
const IS_STAGING_BUILD = is_staging_launcher_build();

if (IS_UPDATE_TEST_BUILD) {
  const runtimePaths = get_update_test_runtime_paths();
  const managedDirectories = [
    runtimePaths.settingsDir,
    runtimePaths.appDataRoot,
    runtimePaths.homeRoot,
    runtimePaths.appDataPathRoot,
    runtimePaths.userDataRoot,
    runtimePaths.sessionDataRoot,
    runtimePaths.electronLogsRoot,
    runtimePaths.crashDumpsRoot,
    runtimePaths.tempRoot,
    runtimePaths.desktopRoot,
    runtimePaths.documentsRoot,
    runtimePaths.downloadsRoot,
    runtimePaths.musicRoot,
    runtimePaths.picturesRoot,
    runtimePaths.videosRoot,
    runtimePaths.updaterCacheRoot,
  ];

  for (const directory of managedDirectories) {
    mkdirSync(directory, { recursive: true });
  }

  process.env.HOME = runtimePaths.homeRoot;
  process.env.TMPDIR = runtimePaths.tempRoot;
  process.env.XDG_CACHE_HOME = runtimePaths.updaterCacheRoot;
  app.setPath("home", runtimePaths.homeRoot);
  app.setPath("appData", runtimePaths.appDataPathRoot);
  app.setPath("userData", runtimePaths.userDataRoot);
  app.setPath("sessionData", runtimePaths.sessionDataRoot);
  app.setPath("logs", runtimePaths.electronLogsRoot);
  app.setPath("crashDumps", runtimePaths.crashDumpsRoot);
  app.setPath("temp", runtimePaths.tempRoot);
  app.setPath("desktop", runtimePaths.desktopRoot);
  app.setPath("documents", runtimePaths.documentsRoot);
  app.setPath("downloads", runtimePaths.downloadsRoot);
  app.setPath("music", runtimePaths.musicRoot);
  app.setPath("pictures", runtimePaths.picturesRoot);
  app.setPath("videos", runtimePaths.videosRoot);
}

load_dotenv_config({ quiet: true });

// Acquire the lock only after update-test builds have moved Electron's
// userData path. A secondary launcher must never run orphan recovery because
// it could otherwise terminate Wine owned by the primary launcher.
const HAS_SINGLE_INSTANCE_LOCK = app.requestSingleInstanceLock();

if (!HAS_SINGLE_INSTANCE_LOCK) {
  isQuitCleanupComplete = true;
  app.quit();
}

/**
 * Applies user-facing app identity after preferences have loaded.
 *
 * The dock icon is set from the main process on macOS so the app looks correct
 * before any renderer window is visible.
 */
function configureAppIdentity(language?: string): void {
  if (!IS_UPDATE_TEST_BUILD) {
    apply_localized_app_name(language, IS_NIGHTLY_BUILD, IS_STAGING_BUILD);
  }

  if (process.platform === "darwin") {
    app.dock.setIcon(get_app_icon_path());
  }
}

/**
 * Boots the application once Electron is ready.
 *
 * Startup order matters here: IPC must be registered before the renderer can
 * send requests, preferences must load before logging/window setup, and update
 * automatic updates begin immediately after the first launcher window is ready.
 */
async function createApp(): Promise<void> {
  const preference = await preferenceManager.getPreference();
  configureAppIdentity(preference.language);
  logManager.init({
    logDir: path.join(expand_user_home_path(preference.dataRootPath), "logs"),
    minLevel: log_level_from_preference(preference.appLoggingLevel),
  });
  await ensure_process_protection(preference);
  if (!IS_UPDATE_TEST_BUILD && !IS_STAGING_BUILD) {
    discordPresenceManager.init(preference.language);
  }
  ipcManager.init();

  // Warm the shared cache without delaying window creation. The renderer can
  // await the same in-flight request if Settings is opened immediately.
  void youtubeManager.getLiveStatus({ handle: BDIH_YOUTUBE_HANDLE });

  const mainWindow = await windowManager.createMainWindow();

  // A Stable return is only considered successful after metadata bootstrap and
  // the main renderer have both opened. If startup fails earlier, the recovery
  // point remains active for diagnosis or recovery.
  await channelTransitionManager.reconcileStartup();
  try {
    await appDataMaintenanceManager.reconcileStartup(preference.dataRootPath);
  } catch (error) {
    // A failed retirement remains retryable because its lifecycle marker is not
    // advanced. App-data maintenance must never prevent the launcher opening.
    logManager.warn("Main", "App-data maintenance failed and will be retried.", error);
  }

  if (preference.autoCheckUpdates) {
    // Only the startup check may automatically install and relaunch. Periodic
    // and manual checks use the confirmation-only IPC path so they cannot stop
    // a game that was launched during the current session.
    void updateManager.checkForUpdatesAndInstall(mainWindow);
  }
}

async function ensure_process_protection(
  preference: Awaited<ReturnType<typeof preferenceManager.getPreference>>,
): Promise<void> {
  processProtectionPromise ??= (async () => {
    const roots = await bottleExecutionManager.getManagedWineRoots(preference);

    // Start the independent Guardian first. If Electron dies while startup
    // recovery is running, the Guardian still finishes cleanup.
    await guardianManager.start(roots);
    const recovery = await bottleExecutionManager.recoverOrphanedWineProcesses(preference);

    if (recovery.detectedPids.length > 0) {
      logManager.warn("Main", "recovered Wine processes from a previous launcher crash", {
        ...recovery,
      });
    }
  })();

  await processProtectionPromise;
}

function ensure_app_created(): Promise<void> {
  if (appCreationPromise) {
    return appCreationPromise;
  }

  appCreationPromise = createApp().finally(() => {
    appCreationPromise = null;
  });
  return appCreationPromise;
}

// Expands only the launcher-supported home shorthand before handing paths to Node APIs.
function expand_user_home_path(targetPath: string): string {
  if (targetPath === "~") {
    return process.env.HOME ?? targetPath;
  }

  if (targetPath.startsWith("~/")) {
    return path.join(process.env.HOME ?? "", targetPath.slice(2));
  }

  return targetPath;
}

interface ActiveWineQuitCopy {
  title: string;
  detail: string;
  cancel: string;
  confirm: string;
}

function get_active_wine_quit_copy(language?: string): ActiveWineQuitCopy {
  switch (language?.toLowerCase().split("-")[0]) {
    case "ko":
      return {
        title: "실행 중인 Wine을 종료할까요?",
        detail: "현재 BDIH Launcher에서 실행한 Wine 앱과 Bottle이 있습니다. 런처를 종료하면 실행 중인 Wine도 모두 종료됩니다. 종료하시겠습니까?",
        cancel: "취소",
        confirm: "Wine 종료 후 앱 종료",
      };
    case "ja":
      return {
        title: "実行中のWineを終了しますか？",
        detail: "BDIH Launcherから起動したWineアプリまたはボトルが実行中です。ランチャーを終了すると、実行中のWineもすべて終了します。終了しますか？",
        cancel: "キャンセル",
        confirm: "Wineを終了してアプリを終了",
      };
    case "zh":
      return {
        title: "要关闭正在运行的 Wine 吗？",
        detail: "BDIH Launcher 启动的 Wine 应用或 Bottle 仍在运行。退出启动器将停止所有正在运行的 Wine。是否退出？",
        cancel: "取消",
        confirm: "停止 Wine 并退出应用",
      };
    default:
      return {
        title: "Quit running Wine apps?",
        detail: "Wine apps or Bottle sessions launched by BDIH Launcher are still running. Quitting the launcher will stop all of them. Do you want to quit?",
        cancel: "Cancel",
        confirm: "Stop Wine and quit",
      };
  }
}

async function confirm_quit_with_active_wine(): Promise<boolean> {
  if (!await bottleExecutionManager.hasManagedWineProcesses()) {
    return true;
  }

  const preference = await preferenceManager.getPreference();
  const copy = get_active_wine_quit_copy(preference.language);
  const options: MessageBoxOptions = {
    type: "warning",
    title: copy.title,
    message: copy.title,
    detail: copy.detail,
    buttons: [copy.cancel, copy.confirm],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  };
  const mainWindow = windowManager.getMainWindow();
  const result = mainWindow
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options);

  return result.response === 1;
}

/**
 * Stops app-owned background work before Electron exits.
 *
 * Wine processes can outlive the renderer, so shutdown is coordinated from the
 * main process. When active Wine processes exist, a shutdown window gives the
 * user visible feedback while the processes are being stopped.
 */
async function cleanupBeforeQuit(): Promise<void> {
  await with_promise_timeout(
    runQuitCleanup(),
    QUIT_CLEANUP_TIMEOUT_MS,
    "Launcher quit cleanup",
  );
}

async function runQuitCleanup(): Promise<void> {
  await runQuitCleanupStage("show-shutdown-window", () =>
    windowManager.showShutdownWindow().then(() => undefined)
  );
  const shutdownWindowShownAt = Date.now();

  shortcutManager.unregisterAll();
  await runQuitCleanupStage("save-window-state", () =>
    windowManager.flushLauncherWindowState()
  );
  await runQuitCleanupStage("flush-pending-writes", () =>
    Promise.all([
      preferenceManager.flushPendingWrites(),
      bottleManager.flushPendingWrites(),
    ]).then(() => undefined)
  );

  // Prefix-session completion updates Discord presence. Finish Wine and
  // downloads before destroying the Discord client so those updates cannot
  // race a half-closed RPC transport.
  await runQuitCleanupStage("stop-managed-processes", () =>
    Promise.all([
      downloadManager.stopAll(),
      bottleExecutionManager.stopAllWineProcesses(),
    ]).then(() => undefined)
  );
  await runQuitCleanupStage("shutdown-discord", () =>
    discordPresenceManager.shutdown()
  );
  await runQuitCleanupStage("disarm-guardian", () =>
    guardianManager.disarm()
  );

  const minimumVisibleMs = 600;
  const remainingVisibleMs = minimumVisibleMs - (Date.now() - shutdownWindowShownAt);

  if (remainingVisibleMs > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, remainingVisibleMs));
  }
}

async function runQuitCleanupStage(
  stage: string,
  operation: () => Promise<void>,
): Promise<void> {
  const startedAt = Date.now();
  logManager.info("Main", "quit cleanup stage started", { stage });

  try {
    await operation();
    logManager.info("Main", "quit cleanup stage completed", {
      stage,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    logManager.error("Main", "quit cleanup stage failed", {
      stage,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Prepares the launcher for a manual or automatic update.
 *
 * The main renderer shows a blocking update dialog while this path checks
 * launcher-owned work, persists state, and stops every tracked app/Bottle
 * before the updater downloads or replaces the application bundle.
 */
async function prepareForUpdateInstall(): Promise<void> {
  windowManager.sendUpdateInstallProgress({ stage: "checking-processes", progress: 5 });

  const activeWineProcesses = await bottleExecutionManager.hasManagedWineProcesses();
  const activeDownloads = downloadManager.listActiveDownloadIds().length;
  logManager.info("Main", "preparing app update", {
    activeWineProcesses,
    activeDownloads,
  });

  shortcutManager.unregisterAll();
  windowManager.sendUpdateInstallProgress({ stage: "saving-state", progress: 12 });
  await windowManager.flushLauncherWindowState();
  await Promise.all([
    preferenceManager.flushPendingWrites(),
    bottleManager.flushPendingWrites(),
  ]);

  windowManager.sendUpdateInstallProgress({ stage: "stopping-processes", progress: 20 });
  await Promise.all([
    discordPresenceManager.shutdown(),
    downloadManager.stopAll(),
    bottleExecutionManager.stopAllWineProcesses(),
  ]);

  windowManager.sendUpdateInstallProgress({ stage: "downloading", progress: 30 });
}

updateManager.setBeforeInstallHandler(prepareForUpdateInstall);
updateManager.setInstallProgressHandler(async (payload) => {
  windowManager.sendUpdateInstallProgress(payload);

  // Give the renderer one paint at the final handoff stage before Squirrel
  // closes Electron and replaces the application bundle.
  if (payload.stage === "installing" && payload.progress >= 96) {
    await guardianManager.disarm();
    await new Promise((resolve) => setTimeout(resolve, UPDATE_INSTALL_HANDOFF_DELAY_MS));
  }
});

function handleStartupFailure(error: unknown): void {
  console.error("BDIH Launcher failed to start.", error);
  app.exit(1);
}

if (HAS_SINGLE_INSTANCE_LOCK) {
  app.on("second-instance", () => {
    const mainWindow = windowManager.getMainWindow();

    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
      return;
    }

    if (app.isReady()) {
      void ensure_app_created().catch(handleStartupFailure);
    }
  });

  app.whenReady().then(async () => {
    await ensure_app_created();

    // macOS keeps apps alive after the last window closes, so recreate the window
    // when the dock icon is clicked and no main window exists.
    app.on("activate", () => {
      if (!windowManager.getMainWindow()) {
        void ensure_app_created().catch(handleStartupFailure);
      }
    });
  }).catch(handleStartupFailure);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Electron's before-quit event is synchronous, so prevent the first quit and
// resume it after async cleanup has completed.
app.on("before-quit", (event) => {
  if (isQuitCleanupComplete || updateManager.isInstallingUpdate()) {
    return;
  }

  event.preventDefault();

  quitCleanupPromise ??= (async () => {
    let confirmed = false;
    try {
      confirmed = await confirm_quit_with_active_wine();
    } catch (error) {
      logManager.warn("Main", "quit confirmation failed", error);
      return;
    }

    if (!confirmed) {
      return;
    }

    try {
      await cleanupBeforeQuit();
      isQuitCleanupComplete = true;
      app.quit();
    } catch (error) {
      if (error instanceof PromiseTimeoutError) {
        // Keep Guardian armed. app.exit() closes its control pipe without the
        // CLEAN marker, so Guardian performs the final Wine cleanup out of
        // process even when a main-process Promise can no longer settle.
        logManager.error("Main", "quit cleanup timed out; handing cleanup to Guardian", {
          timeoutMs: error.timeoutMs,
          operation: error.operation,
        });
        isQuitCleanupComplete = true;
        app.exit(0);
        return;
      }

      // Do not let Electron exit while launcher-owned Wine processes remain.
      // The user can retry after inspecting the recorded process IDs.
      logManager.error("Main", "quit cleanup failed; keeping the launcher open", error);
      const message = error instanceof Error ? error.message : String(error);
      dialog.showErrorBox("Wine 종료 실패", `일부 Wine 프로세스를 종료하지 못해 앱을 종료하지 않았습니다.\n\n${message}`);
    } finally {
      windowManager.closeShutdownWindow();
    }
  })().finally(() => {
    if (!isQuitCleanupComplete) {
      quitCleanupPromise = null;
    }
  });
});

app.on("will-quit", () => {
  shortcutManager.unregisterAll();
  void discordPresenceManager.shutdown();
});
