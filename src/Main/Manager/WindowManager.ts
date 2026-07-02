import { app, BrowserWindow, LoadFileOptions, Menu, nativeImage, Tray } from "electron";
import path from "path";
import { get_app_icon_path } from "../Environment/AppIcon";
import { bottleManager } from "./BottleManager";
import { logManager } from "./LogManager";
import { preferenceManager } from "./PreferenceManager";
import { rosettaManager } from "./RosettaManager";

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

const DEFAULT_STARTUP_CHECKS: StartupCheck[] = [
  {
    message: "Checking app metadata...",
    progress: 28,
    delayMs: 350,
    run: () => bottleManager.bootstrapAppMetadata(),
  },
  { message: "Preparing renderer...", progress: 64, delayMs: 450 },
  { message: "Opening launcher...", progress: 100, delayMs: 350 },
];

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private splashWindow: BrowserWindow | null = null;
  private shutdownWindow: BrowserWindow | null = null;
  private tray: Tray | null = null;
  private rosettaGateResolve: (() => void) | null = null;
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

    const window = this.createLauncherWindow();
    const readyToShow = this.waitForReadyToShow(window);

    await this.loadView("MainView", window);
    await readyToShow;

    if (!splashWindow.isDestroyed()) {
      splashWindow.close();
    }

    if (!window.isDestroyed()) {
      window.show();
      window.focus();
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

  async showShutdownWindow(): Promise<BrowserWindow> {
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

    window.once("ready-to-show", () => {
      if (!window.isDestroyed()) {
        window.show();
        window.focus();
      }
    });

    window.on("closed", () => {
      if (this.shutdownWindow === window) {
        this.shutdownWindow = null;
      }
    });

    await window.loadFile(this.getRendererViewPath("SplashView"), {
      query: {
        mode: "shutdown",
      },
    });

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

      trayIcon.setTemplateImage(true);
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

    window.once("ready-to-show", () => {
      if (!window.isDestroyed()) {
        window.show();
      }
    });

    window.on("closed", () => {
      if (this.splashWindow === window) {
        this.splashWindow = null;
      }
    });

    await this.loadView("SplashView", window);

    return window;
  }

  private createLauncherWindow(): BrowserWindow {
    const window = new BrowserWindow({
      width: 1200,
      height: 800,
      icon: get_app_icon_path(),
      minWidth: 960,
      minHeight: 640,
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

    window.on("closed", () => {
      if (this.mainWindow === window) {
        this.mainWindow = null;
      }
    });

    return window;
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

export const windowManager = new WindowManager();
