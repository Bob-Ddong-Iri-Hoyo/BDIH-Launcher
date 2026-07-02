import { app } from "electron";
import path from "path";
import { get_app_icon_path } from "./Environment/AppIcon";
import { apply_localized_app_name } from "./Environment/AppIdentity";
import { bottleExecutionManager } from "./Manager/BottleExecutionManager";
import { ipcManager } from "./Manager/IPCManager";
import { log_level_from_preference, logManager } from "./Manager/LogManager";
import { preferenceManager } from "./Manager/PreferenceManager";
import { shortcutManager } from "./Manager/ShortcutManager";
import { updateManager } from "./Manager/UpdateManager";
import { windowManager } from "./Manager/WindowManager";

// Main-process entry state used to make the asynchronous quit cleanup idempotent.
let isQuitCleanupComplete = false;
let quitCleanupPromise: Promise<void> | null = null;
const AUTO_UPDATE_CHECK_DELAY_MS = 2_000;

/**
 * Applies user-facing app identity after preferences have loaded.
 *
 * The dock icon is set from the main process on macOS so the app looks correct
 * before any renderer window is visible.
 */
function configureAppIdentity(language?: string): void {
  apply_localized_app_name(language);

  if (process.platform === "darwin") {
    app.dock.setIcon(get_app_icon_path());
  }
}

/**
 * Boots the application once Electron is ready.
 *
 * Startup order matters here: IPC must be registered before the renderer can
 * send requests, preferences must load before logging/window setup, and update
 * checks are delayed slightly so the first paint is not competing with network
 * work.
 */
async function createApp(): Promise<void> {
  const preference = await preferenceManager.getPreference();
  configureAppIdentity(preference.language);
  logManager.init({
    logDir: path.join(expand_user_home_path(preference.dataRootPath), "logs"),
    minLevel: log_level_from_preference(preference.appLoggingLevel),
  });
  ipcManager.init();

  const mainWindow = await windowManager.createMainWindow();

  if (preference.autoCheckUpdates) {
    setTimeout(() => {
      void updateManager.checkForUpdatesAndNotify(mainWindow);
    }, AUTO_UPDATE_CHECK_DELAY_MS);
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
  const shouldShowShutdownWindow = bottleExecutionManager.hasActiveWineProcesses();

  if (shouldShowShutdownWindow) {
    await windowManager.showShutdownWindow();
  }

  await bottleExecutionManager.stopAllWineProcesses();
}

app.whenReady().then(async () => {
  await createApp();

  // macOS keeps apps alive after the last window closes, so recreate the window
  // when the dock icon is clicked and no main window exists.
  app.on("activate", () => {
    if (!windowManager.getMainWindow()) {
      void createApp();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Electron's before-quit event is synchronous, so prevent the first quit and
// resume it after async cleanup has completed.
app.on("before-quit", (event) => {
  if (isQuitCleanupComplete) {
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
});
