import { BrowserWindow } from "electron";
import path from "path";
import { logManager } from "./LogManager";

export type RendererViewName =
  | "SplashView"
  | "MainView"
  | "PreferenceView"
  | "TerminalView";

export interface StartupCheck {
  message: string;
  progress: number;
  delayMs: number;
}

const DEFAULT_STARTUP_CHECKS: StartupCheck[] = [
  { message: "Checking launcher files...", progress: 28, delayMs: 350 },
  { message: "Preparing renderer...", progress: 64, delayMs: 450 },
  { message: "Opening launcher...", progress: 100, delayMs: 350 },
];

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
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

    const window = new BrowserWindow({
      width: 1200,
      height: 800,
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

    window.once("ready-to-show", () => {
      if (!window.isDestroyed()) {
        window.show();
      }
    });

    window.on("closed", () => {
      if (this.mainWindow === window) {
        this.mainWindow = null;
      }
    });

    await this.loadView("SplashView", window);
    await this.runStartupChecks();

    if (!window.isDestroyed()) {
      await this.loadView("MainView", window);
    }

    return window;
  }

  async loadView(
    viewName: RendererViewName,
    window = this.requireMainWindow(),
  ): Promise<void> {
    await window.loadFile(this.getRendererViewPath(viewName));
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

  private getRendererViewPath(viewName: RendererViewName): string {
    return path.join(__dirname, "../renderer/View", `${viewName}.html`);
  }

  private async runStartupChecks(): Promise<void> {
    for (const check of this.startupChecks) {
      this.logger.info(check.message, { progress: check.progress });
      await new Promise((resolve) => setTimeout(resolve, check.delayMs));
    }
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

export const windowManager = new WindowManager();
