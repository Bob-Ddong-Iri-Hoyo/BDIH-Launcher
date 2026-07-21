import { app, BrowserWindow, LoadFileOptions, Menu, nativeImage, screen, Tray } from "electron";
import path from "path";
import { AppUpdateInstallProgressPayload, IPC_CHANNELS, LAUNCHER_WINDOW_DEFAULT_SIZE, LAUNCHER_WINDOW_MIN_SIZE, LAUNCHER_WINDOW_PRESET_SIZES, LauncherPreferencePayload } from "../../Common/Types/IPC";
import { get_app_icon_path } from "../Environment/AppIcon";
import { send_to_web_contents } from "../Util/SafeWebContents";
import { isCloseWindowShortcut } from "../Util/WindowShortcut";
import { bottleManager } from "./BottleManager";
import { dxmtManager } from "./DxmtManager";
import { jadeiteManager } from "./JadeiteManager";
import { logManager } from "./LogManager";
import { preferenceManager } from "./PreferenceManager";
import { rosettaManager } from "./RosettaManager";
import { wineManager } from "./WineManager";

export type RendererViewName =
  | "SplashView"
  | "MainView"
  | "PreferenceView"
  | "TerminalView";

export interface StartupCheck {
  message: string;
  progress: number;
  delayMs: number;
  run?: () => Promise<void> | void;
}

interface LauncherWindowStartupState {
  width: number;
  height: number;
  maximized: boolean;
  fullscreen: boolean;
}

const DEFAULT_STARTUP_CHECKS: StartupCheck[] = [
  {
    message: "Loading launcher settings...",
    progress: 18,
    delayMs: 120,
    run: async () => {
      await preferenceManager.getPreference();
    },
  },
  {
    message: "Checking bottle metadata...",
    progress: 42,
    delayMs: 120,
    run: () => bottleManager.bootstrapAppMetadata(),
  },
  {
    message: "Warming runtime catalogs...",
    progress: 76,
    delayMs: 120,
    run: () => warm_startup_runtime_catalogs(),
  },
  { message: "Opening launcher...", progress: 100, delayMs: 220 },
];

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private splashWindow: BrowserWindow | null = null;
  private shutdownWindow: BrowserWindow | null = null;
  private tray: Tray | null = null;
  private rosettaGateResolve: (() => void) | null = null;
  private launcherWindowStateSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly logger = logManager.createLogger("WindowManager");

  constructor(private readonly startupChecks = DEFAULT_STARTUP_CHECKS) {}

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow && !this.mainWindow.isDestroyed()
      ? this.mainWindow
      : null;
  }

  async createMainWindow(): Promise<BrowserWindow> {
    const currentWindow = this.getMainWindow();

    if (currentWindow) {
      currentWindow.focus();
      return currentWindow;
    }

    const splashWindow = await this.createSplashWindow();
    await this.waitForRosettaPrerequisite(splashWindow);
    await this.runStartupChecks();

    const preference = await preferenceManager.getPreference();
    const window = this.createLauncherWindow(preference);
    const readyToShow = this.waitForReadyToShow(window);

    await this.loadView("MainView", window);
    await readyToShow;

    if (!splashWindow.isDestroyed()) {
      splashWindow.close();
    }

    if (!window.isDestroyed()) {
      window.show();
      window.focus();
      await this.persistLauncherWindowState(window);
    }

    return window;
  }

  async loadView(
    viewName: RendererViewName,
    window = this.requireMainWindow(),
    options?: LoadFileOptions,
  ): Promise<void> {
    await window.loadFile(this.getRendererViewPath(viewName), options);
  }

  releaseRosettaGate(): void {
    const resolve = this.rosettaGateResolve;

    this.rosettaGateResolve = null;
    resolve?.();
  }

  minimizeMainWindow(): void {
    this.getMainWindow()?.minimize();
  }

  toggleMainWindowMaximize(): void {
    const window = this.getMainWindow();

    if (!window) {
      return;
    }

    if (window.isMaximized()) {
      window.unmaximize();
      return;
    }

    window.maximize();
  }

  async requestQuitOrHideToTray(): Promise<void> {
    const preference = await preferenceManager.getPreference();

    if (!preference.closeToTray) {
      app.quit();
      return;
    }

    this.hideMainWindowToTray(preference.language);
  }

  hideMainWindowToTray(language?: string): void {
    const window = this.getMainWindow();

    this.ensureTray(language);

    if (window && !window.isDestroyed()) {
      window.hide();
    }

    if (process.platform === "darwin") {
      app.dock.hide();
    }
  }

  showMainWindowFromTray(): void {
    const window = this.getMainWindow();

    if (process.platform === "darwin") {
      app.dock.show();
    }

    if (!window || window.isDestroyed()) {
      void this.createMainWindow();
      return;
    }

    if (window.isMinimized()) {
      window.restore();
    }

    window.show();
    window.focus();
  }

  async flushLauncherWindowState(): Promise<void> {
    if (this.launcherWindowStateSaveTimer) {
      clearTimeout(this.launcherWindowStateSaveTimer);
      this.launcherWindowStateSaveTimer = null;
    }

    const window = this.getMainWindow();

    if (window && !window.isDestroyed()) {
      await this.persistLauncherWindowState(window);
    }
  }

  async showShutdownWindow(): Promise<BrowserWindow> {
    return this.showShutdownLifecycleWindow();
  }

  sendUpdateInstallProgress(payload: AppUpdateInstallProgressPayload): void {
    send_to_web_contents(
      this.getMainWindow()?.webContents,
      IPC_CHANNELS.APP.UPDATE_INSTALL_PROGRESS.channelName,
      payload,
    );
  }

  private async showShutdownLifecycleWindow(): Promise<BrowserWindow> {
    const currentShutdownWindow = this.shutdownWindow && !this.shutdownWindow.isDestroyed()
      ? this.shutdownWindow
      : null;

    if (currentShutdownWindow) {
      currentShutdownWindow.show();
      currentShutdownWindow.focus();
      return currentShutdownWindow;
    }

    const mainWindow = this.getMainWindow();
    const parentWindow = mainWindow?.isVisible() ? mainWindow : undefined;

    if (process.platform === "darwin") {
      app.dock.show();
    }

    const window = new BrowserWindow({
      width: 720,
      height: 460,
      icon: get_app_icon_path(),
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      frame: false,
      modal: Boolean(parentWindow),
      parent: parentWindow,
      acceptFirstMouse: true,
      autoHideMenuBar: true,
      backgroundColor: "#050812",
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.shutdownWindow = window;
    this.bindWindowDebugEvents(window);

    window.on("closed", () => {
      if (this.shutdownWindow === window) {
        this.shutdownWindow = null;
      }
    });

    const readyToShow = this.waitForReadyToShow(window);
    const loadPromise = window.loadFile(this.getRendererViewPath("SplashView"), {
      query: {
        mode: "shutdown",
      },
    });

    await readyToShow;
    await loadPromise;

    if (!window.isDestroyed()) {
      window.show();
      window.focus();
    }

    return window;
  }

  closeShutdownWindow(): void {
    if (this.shutdownWindow && !this.shutdownWindow.isDestroyed()) {
      this.shutdownWindow.close();
    }

    this.shutdownWindow = null;
  }

  private ensureTray(language?: string): Tray {
    if (!this.tray || this.tray.isDestroyed()) {
      const trayIcon = nativeImage.createFromPath(get_app_icon_path()).resize({
        width: 18,
        height: 18,
      });

      // Keep the launcher's original colors instead of letting macOS convert
      // the app icon into a monochrome menu-bar template image.
      trayIcon.setTemplateImage(false);
      this.tray = new Tray(trayIcon);
      this.tray.setToolTip("BDIH Launcher");
      this.tray.on("click", () => this.showMainWindowFromTray());
      this.tray.on("double-click", () => this.showMainWindowFromTray());
    }

    this.tray.setContextMenu(this.createTrayContextMenu(language));
    return this.tray;
  }

  private createTrayContextMenu(language?: string): Menu {
    const labels = tray_menu_labels(language);

    return Menu.buildFromTemplate([
      {
        label: labels.show,
        click: () => this.showMainWindowFromTray(),
      },
      { type: "separator" },
      {
        label: labels.quit,
        click: () => app.quit(),
      },
    ]);
  }

  private getRendererViewPath(viewName: RendererViewName): string {
    return path.join(__dirname, "../renderer/View", `${viewName}.html`);
  }

  private async runStartupChecks(): Promise<void> {
    for (const check of this.startupChecks) {
      this.logger.info(check.message, { progress: check.progress });
      await check.run?.();
      await new Promise((resolve) => setTimeout(resolve, check.delayMs));
    }
  }

  private async waitForRosettaPrerequisite(splashWindow: BrowserWindow): Promise<void> {
    const status = await rosettaManager.getStatus();

    if (status.status !== "missing") {
      return;
    }

    await this.loadView("SplashView", splashWindow, {
      query: {
        mode: "rosetta-required",
      },
    });

    await new Promise<void>((resolve) => {
      this.rosettaGateResolve = resolve;
    });

    if (!splashWindow.isDestroyed()) {
      await this.loadView("SplashView", splashWindow);
    }
  }

  private async createSplashWindow(): Promise<BrowserWindow> {
    const currentSplashWindow = this.splashWindow && !this.splashWindow.isDestroyed()
      ? this.splashWindow
      : null;

    if (currentSplashWindow) {
      currentSplashWindow.focus();
      return currentSplashWindow;
    }

    const window = new BrowserWindow({
      width: 720,
      height: 460,
      icon: get_app_icon_path(),
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      frame: false,
      acceptFirstMouse: true,
      autoHideMenuBar: true,
      backgroundColor: "#0b1020",
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.splashWindow = window;
    this.bindWindowDebugEvents(window);

    window.on("closed", () => {
      if (this.splashWindow === window) {
        this.splashWindow = null;
      }
    });

    const readyToShow = this.waitForReadyToShow(window);
    const loadPromise = this.loadView("SplashView", window);

    await readyToShow;

    if (!window.isDestroyed()) {
      window.show();
    }

    await loadPromise;

    return window;
  }

  private createLauncherWindow(preference: LauncherPreferencePayload): BrowserWindow {
    const startupState = this.resolveLauncherWindowStartupState(preference);
    const window = new BrowserWindow({
      width: startupState.width,
      height: startupState.height,
      icon: get_app_icon_path(),
      minWidth: LAUNCHER_WINDOW_MIN_SIZE.width,
      minHeight: LAUNCHER_WINDOW_MIN_SIZE.height,
      fullscreen: startupState.fullscreen,
      frame: false,
      acceptFirstMouse: true,
      autoHideMenuBar: true,
      backgroundColor: "#0b1020",
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.mainWindow = window;
    this.bindWindowDebugEvents(window);
    this.bindNavigationGuards(window);
    this.bindLauncherWindowStatePersistence(window);
    this.disableCloseWindowShortcut(window);

    if (startupState.maximized && !startupState.fullscreen) {
      window.maximize();
    }

    window.on("closed", () => {
      if (this.launcherWindowStateSaveTimer) {
        clearTimeout(this.launcherWindowStateSaveTimer);
        this.launcherWindowStateSaveTimer = null;
      }

      if (this.mainWindow === window) {
        this.mainWindow = null;
      }
    });

    return window;
  }

  private disableCloseWindowShortcut(window: BrowserWindow): void {
    window.webContents.on("before-input-event", (event, input) => {
      if (isCloseWindowShortcut(input)) {
        event.preventDefault();
      }
    });
  }

  applyLauncherWindowStartupSize(preference: LauncherPreferencePayload): void {
    const window = this.getMainWindow();

    if (!window) {
      return;
    }

    const startupState = this.resolveLauncherWindowStartupState(preference);
    const applyWindowedState = () => {
      if (window.isDestroyed()) {
        return;
      }

      if (startupState.maximized) {
        if (!window.isMaximized()) {
          window.maximize();
        }
        return;
      }

      if (window.isMaximized()) {
        window.unmaximize();
      }

      window.setSize(startupState.width, startupState.height, true);
      window.center();
    };

    // Startup sizing always stays in windowed mode. Old native full-screen
    // state is exited before applying the requested bounds.
    if (window.isFullScreen()) {
      window.once("leave-full-screen", applyWindowedState);
      window.setFullScreen(false);
      return;
    }

    applyWindowedState();
  }

  private resolveLauncherWindowStartupState(preference: LauncherPreferencePayload): LauncherWindowStartupState {
    const mode = preference.windowStartupSizeMode ?? "default";
    let width: number = LAUNCHER_WINDOW_DEFAULT_SIZE.width;
    let height: number = LAUNCHER_WINDOW_DEFAULT_SIZE.height;
    let maximized = false;
    let fullscreen = false;

    if (mode === "wide" || mode === "large") {
      width = LAUNCHER_WINDOW_PRESET_SIZES[mode].width;
      height = LAUNCHER_WINDOW_PRESET_SIZES[mode].height;
    } else if (mode === "maximized") {
      maximized = true;
    } else if (mode === "custom") {
      width = preference.windowStartupCustomWidth ?? LAUNCHER_WINDOW_DEFAULT_SIZE.width;
      height = preference.windowStartupCustomHeight ?? LAUNCHER_WINDOW_DEFAULT_SIZE.height;
    } else if (mode === "last" && preference.lastWindowWidth && preference.lastWindowHeight) {
      width = preference.lastWindowWidth;
      height = preference.lastWindowHeight;
      maximized = (preference.lastWindowMaximized ?? false)
        || (preference.lastWindowFullscreen ?? false);
    }

    const workAreaSize = screen.getPrimaryDisplay().workAreaSize;
    const maximumWidth = Math.max(LAUNCHER_WINDOW_MIN_SIZE.width, workAreaSize.width);
    const maximumHeight = Math.max(LAUNCHER_WINDOW_MIN_SIZE.height, workAreaSize.height);

    return {
      width: Math.min(maximumWidth, Math.max(LAUNCHER_WINDOW_MIN_SIZE.width, Math.round(width))),
      height: Math.min(maximumHeight, Math.max(LAUNCHER_WINDOW_MIN_SIZE.height, Math.round(height))),
      maximized,
      fullscreen,
    };
  }

  private bindLauncherWindowStatePersistence(window: BrowserWindow): void {
    const scheduleSave = () => this.scheduleLauncherWindowStateSave(window);

    window.on("resize", scheduleSave);
    window.on("maximize", scheduleSave);
    window.on("unmaximize", scheduleSave);
    window.on("enter-full-screen", scheduleSave);
    window.on("leave-full-screen", scheduleSave);
  }

  private scheduleLauncherWindowStateSave(window: BrowserWindow): void {
    if (this.launcherWindowStateSaveTimer) {
      clearTimeout(this.launcherWindowStateSaveTimer);
    }

    this.launcherWindowStateSaveTimer = setTimeout(() => {
      this.launcherWindowStateSaveTimer = null;
      void this.persistLauncherWindowState(window);
    }, 300);
  }

  private async persistLauncherWindowState(window: BrowserWindow): Promise<void> {
    if (window.isDestroyed()) {
      return;
    }

    const bounds = window.getNormalBounds();

    try {
      await preferenceManager.updatePreference({
        lastWindowWidth: bounds.width,
        lastWindowHeight: bounds.height,
        lastWindowMaximized: window.isMaximized(),
        lastWindowFullscreen: window.isFullScreen(),
      });
    } catch (error) {
      this.logger.warn("failed to save launcher window size", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private waitForReadyToShow(window: BrowserWindow): Promise<void> {
    return new Promise((resolve) => {
      if (window.isDestroyed()) {
        resolve();
        return;
      }

      window.once("ready-to-show", () => resolve());
    });
  }

  private bindNavigationGuards(window: BrowserWindow): void {
    window.on("app-command", (event, command) => {
      if (command === "browser-backward" || command === "browser-forward") {
        event.preventDefault();
      }
    });

    window.webContents.on("will-navigate", (event, url) => {
      if (url.includes("SplashView.html")) {
        event.preventDefault();
      }
    });
  }

  private bindWindowDebugEvents(window: BrowserWindow): void {
    window.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedURL) => {
        this.logger.error("renderer failed to load", {
          errorCode,
          errorDescription,
          validatedURL,
        });
      },
    );

    window.webContents.on("render-process-gone", (_event, details) => {
      this.logger.error("renderer process gone", details);
    });

    window.webContents.on(
      "console-message",
      (_event, level, message, line, sourceId) => {
        this.logger.info("renderer console", { level, message, line, sourceId });
      },
    );
  }

  private requireMainWindow(): BrowserWindow {
    const window = this.getMainWindow();

    if (!window) {
      throw new Error("Main window is not created.");
    }

    return window;
  }
}

function tray_menu_labels(language?: string): { show: string; quit: string } {
  const normalizedLanguage = language?.split("-")[0]?.toLowerCase();

  if (normalizedLanguage === "ko") {
    return {
      show: "런처 열기",
      quit: "런처 종료",
    };
  }

  if (normalizedLanguage === "ja") {
    return {
      show: "ランチャーを開く",
      quit: "ランチャーを終了",
    };
  }

  return {
    show: "Show Launcher",
    quit: "Quit Launcher",
  };
}

async function warm_startup_runtime_catalogs(): Promise<void> {
  const warmup = Promise.allSettled([
    wineManager.getVersionList(),
    dxmtManager.getVersionList(),
    jadeiteManager.getVersionList(),
  ]);

  await Promise.race([
    warmup.then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 2500)),
  ]);
}

export const windowManager = new WindowManager();
