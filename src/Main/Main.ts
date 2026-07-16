import { app } from "electron";
import { config as load_dotenv_config } from "dotenv";
import { mkdirSync } from "fs";
import path from "path";
import { get_update_test_runtime_paths, is_update_test_build } from "./Environment/AppPaths";
import { get_app_icon_path } from "./Environment/AppIcon";
import { apply_localized_app_name } from "./Environment/AppIdentity";
import { bottleExecutionManager } from "./Manager/BottleExecutionManager";
import { discordPresenceManager } from "./Manager/DiscordPresenceManager";
import { downloadManager } from "./Manager/DownloadManager";
import { ipcManager } from "./Manager/IPCManager";
import { log_level_from_preference, logManager } from "./Manager/LogManager";
import { preferenceManager } from "./Manager/PreferenceManager";
import { shortcutManager } from "./Manager/ShortcutManager";
import { updateManager } from "./Manager/UpdateManager";
import { windowManager } from "./Manager/WindowManager";

// Main-process entry state used to make the asynchronous quit cleanup idempotent.
let isQuitCleanupComplete = false;
let quitCleanupPromise: Promise<void> | null = null;
const UPDATE_INSTALL_HANDOFF_DELAY_MS = 350;
const IS_UPDATE_TEST_BUILD = is_update_test_build();

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

/**
 * Applies user-facing app identity after preferences have loaded.
 *
 * The dock icon is set from the main process on macOS so the app looks correct
 * before any renderer window is visible.
 */
function configureAppIdentity(language?: string): void {
  if (!IS_UPDATE_TEST_BUILD) {
    apply_localized_app_name(language);
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
  if (!IS_UPDATE_TEST_BUILD) {
    discordPresenceManager.init(preference.language);
  }
  ipcManager.init();

  const mainWindow = await windowManager.createMainWindow();

  if (preference.autoCheckUpdates) {
    void updateManager.checkForUpdatesAndInstall(mainWindow);
  }
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

/**
 * Stops app-owned background work before Electron exits.
 *
 * Wine processes can outlive the renderer, so shutdown is coordinated from the
 * main process. When active Wine processes exist, a shutdown window gives the
 * user visible feedback while the processes are being stopped.
 */
async function cleanupBeforeQuit(): Promise<void> {
  shortcutManager.unregisterAll();
  await windowManager.flushLauncherWindowState();
  await preferenceManager.flushPendingWrites();
  const shouldShowShutdownWindow =
    bottleExecutionManager.hasActiveWineProcesses() ||
    downloadManager.listActiveDownloadIds().length > 0;

  if (shouldShowShutdownWindow) {
    await windowManager.showShutdownWindow();
  }

  await Promise.all([
    discordPresenceManager.shutdown(),
    downloadManager.stopAll(),
    bottleExecutionManager.stopAllWineProcesses(),
  ]);
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

  const activeWineProcesses = bottleExecutionManager.hasActiveWineProcesses();
  const activeDownloads = downloadManager.listActiveDownloadIds().length;
  logManager.info("Main", "preparing app update", {
    activeWineProcesses,
    activeDownloads,
  });

  shortcutManager.unregisterAll();
  windowManager.sendUpdateInstallProgress({ stage: "saving-state", progress: 12 });
  await windowManager.flushLauncherWindowState();
  await preferenceManager.flushPendingWrites();

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
    await new Promise((resolve) => setTimeout(resolve, UPDATE_INSTALL_HANDOFF_DELAY_MS));
  }
});

function handleStartupFailure(error: unknown): void {
  console.error("BDIH Launcher failed to start.", error);
  app.exit(1);
}

app.whenReady().then(async () => {
  await createApp();

  // macOS keeps apps alive after the last window closes, so recreate the window
  // when the dock icon is clicked and no main window exists.
  app.on("activate", () => {
    if (!windowManager.getMainWindow()) {
      void createApp().catch(handleStartupFailure);
    }
  });
}).catch(handleStartupFailure);

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

  quitCleanupPromise ??= cleanupBeforeQuit()
    .catch((error) => {
      logManager.warn("Main", "quit cleanup failed", error);
    })
    .finally(() => {
      windowManager.closeShutdownWindow();
      isQuitCleanupComplete = true;
      app.quit();
    });
});

app.on("will-quit", () => {
  shortcutManager.unregisterAll();
  void discordPresenceManager.shutdown();
});
