import { app } from "electron";
import type { LauncherLogLevel } from "../Common/Types/IPC";
import { bottleExecutionManager } from "./Manager/BottleExecutionManager";
import { ipcManager } from "./Manager/IPCManager";
import { logManager } from "./Manager/LogManager";
import type { LogLevel } from "./Manager/LogManager";
import { preferenceManager } from "./Manager/PreferenceManager";
import { shortcutManager } from "./Manager/ShortcutManager";
import { updateManager } from "./Manager/UpdateManager";
import { windowManager } from "./Manager/WindowManager";

logManager.init();

let isQuitCleanupComplete = false;
let quitCleanupPromise: Promise<void> | null = null;

function log_level_from_preference(loggingLevel: LauncherLogLevel): LogLevel {
  if (loggingLevel === "all") {
    return "debug";
  }

  if (loggingLevel === "off") {
    return "info";
  }

  return loggingLevel;
}

async function createApp(): Promise<void> {
  ipcManager.init();

  const preference = await preferenceManager.getPreference();
  logManager.setMinLevel(log_level_from_preference(preference.appLoggingLevel));

  const mainWindow = await windowManager.createMainWindow();

  if (preference.autoCheckUpdates) {
    void updateManager.checkForUpdatesAndNotify(mainWindow);
  }
}

async function cleanupBeforeQuit(): Promise<void> {
  shortcutManager.unregisterAll();
  await bottleExecutionManager.stopAllWineProcesses();
}

app.whenReady().then(async () => {
  await createApp();

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
      isQuitCleanupComplete = true;
      app.quit();
    });
});

app.on("will-quit", () => {
  shortcutManager.unregisterAll();
});
