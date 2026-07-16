import { EventEmitter } from "events";
import { jest } from "@jest/globals";
import type {
  AppUpdateInstallProgressPayload,
  AppUpdateStatusPayload,
} from "../../../src/Common/Types/IPC";

type AsyncMock = ReturnType<typeof jest.fn<() => Promise<unknown>>>;

interface MockAutoUpdater extends EventEmitter {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  channel: string;
  checkForUpdates: AsyncMock;
  downloadUpdate: AsyncMock;
  quitAndInstall: ReturnType<typeof jest.fn>;
}

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
}

interface UpdateManagerHarness {
  manager: import("../../../src/Main/Manager/UpdateManager").UpdateManager;
  updater: MockAutoUpdater;
  sendToWebContents: ReturnType<typeof jest.fn>;
}

function create_deferred(): Deferred {
  let resolvePromise!: () => void;
  let rejectPromise!: (error: Error) => void;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  };
}

function create_mock_auto_updater(): MockAutoUpdater {
  const updater = new EventEmitter() as MockAutoUpdater;

  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.allowPrerelease = false;
  updater.channel = "latest";
  updater.checkForUpdates = jest.fn(async () => undefined);
  updater.downloadUpdate = jest.fn(async () => undefined);
  updater.quitAndInstall = jest.fn();

  return updater;
}

function create_harness(): UpdateManagerHarness {
  const updater = create_mock_auto_updater();
  const sendToWebContents = jest.fn();
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  jest.doMock("electron", () => ({
    app: {
      isPackaged: true,
      getVersion: jest.fn(() => "1.2.0"),
    },
  }));
  jest.doMock("electron-updater", () => ({ autoUpdater: updater }));
  jest.doMock("../../../src/Main/Manager/PreferenceManager", () => ({
    preferenceManager: {
      getPreference: jest.fn(async () => ({ updateChannel: "stable" })),
    },
  }));
  jest.doMock("../../../src/Main/Environment/AppPaths", () => ({
    is_nightly_update_test_build: jest.fn(() => false),
  }));
  jest.doMock("../../../src/Main/Manager/LogManager", () => ({
    logManager: {
      createLogger: jest.fn(() => logger),
    },
  }));
  jest.doMock("../../../src/Main/Util/SafeWebContents", () => ({
    send_to_web_contents: sendToWebContents,
  }));

  const { UpdateManager } = require("../../../src/Main/Manager/UpdateManager") as typeof import("../../../src/Main/Manager/UpdateManager");

  return {
    manager: new UpdateManager(),
    updater,
    sendToWebContents,
  };
}

function emitted_statuses(sendToWebContents: ReturnType<typeof jest.fn>): AppUpdateStatusPayload[] {
  return sendToWebContents.mock.calls.map((call) => call[2] as AppUpdateStatusPayload);
}

describe("UpdateManager", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("disables automatic download and install-on-quit by default", () => {
    const { manager, updater } = create_harness();

    manager.init();

    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
  });

  it("automatically installs an update discovered by the startup check", async () => {
    const { manager, updater } = create_harness();
    const beforeInstall = jest.fn(async () => undefined);

    manager.setBeforeInstallHandler(beforeInstall);
    updater.checkForUpdates.mockImplementation(async () => {
      updater.emit("update-available", { version: "1.2.1" });
      return undefined;
    });
    updater.downloadUpdate.mockImplementation(async () => {
      updater.emit("update-downloaded", { version: "1.2.1" });
      return undefined;
    });

    await manager.checkForUpdatesAndInstall();

    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(beforeInstall).toHaveBeenCalledTimes(1);
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it("leaves the launcher running when the startup check is already current", async () => {
    const { manager, updater } = create_harness();
    const beforeInstall = jest.fn(async () => undefined);

    manager.setBeforeInstallHandler(beforeInstall);
    updater.checkForUpdates.mockImplementation(async () => {
      updater.emit("update-not-available", { version: "1.2.0" });
      return undefined;
    });

    await manager.checkForUpdatesAndInstall();

    expect(beforeInstall).not.toHaveBeenCalled();
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("keeps manual checks non-installing until the user confirms", async () => {
    const { manager, updater } = create_harness();
    const beforeInstall = jest.fn(async () => undefined);

    manager.setBeforeInstallHandler(beforeInstall);
    updater.checkForUpdates.mockImplementation(async () => {
      updater.emit("update-available", { version: "1.2.1" });
      return undefined;
    });

    await manager.checkForUpdates();

    expect(beforeInstall).not.toHaveBeenCalled();
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("rejects installation before an update is available", async () => {
    const { manager, updater, sendToWebContents } = create_harness();
    const beforeInstall = jest.fn(async () => undefined);
    const installFailure = jest.fn();

    manager.init();
    manager.setBeforeInstallHandler(beforeInstall);
    manager.setInstallFailureHandler(installFailure);
    await manager.quitAndInstall();

    expect(beforeInstall).not.toHaveBeenCalled();
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    expect(installFailure).not.toHaveBeenCalled();
    expect(manager.isInstallingUpdate()).toBe(false);
    expect(emitted_statuses(sendToWebContents)).toContainEqual(expect.objectContaining({
      status: "error",
      error: "No available update is ready to install.",
    }));
  });

  it("waits for before-install cleanup before downloading and installs only after update-downloaded", async () => {
    const { manager, updater } = create_harness();
    const cleanup = create_deferred();
    const beforeInstall = jest.fn(() => cleanup.promise);

    manager.init();
    manager.setBeforeInstallHandler(beforeInstall);
    updater.emit("update-available", { version: "1.2.1" });
    updater.downloadUpdate.mockImplementation(async () => {
      expect(updater.quitAndInstall).not.toHaveBeenCalled();
      updater.emit("update-downloaded", { version: "1.2.1" });
      return undefined;
    });

    const installPromise = manager.quitAndInstall();

    expect(beforeInstall).toHaveBeenCalledTimes(1);
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();

    cleanup.resolve();
    await installPromise;

    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it("deduplicates concurrent installation requests", async () => {
    const { manager, updater } = create_harness();
    const cleanup = create_deferred();
    const beforeInstall = jest.fn(() => cleanup.promise);

    manager.init();
    manager.setBeforeInstallHandler(beforeInstall);
    updater.emit("update-available", { version: "1.2.1" });
    updater.downloadUpdate.mockImplementation(async () => {
      updater.emit("update-downloaded", { version: "1.2.1" });
      return undefined;
    });

    const firstRequest = manager.quitAndInstall();
    const duplicateRequest = manager.quitAndInstall();

    expect(beforeInstall).toHaveBeenCalledTimes(1);
    expect(updater.downloadUpdate).not.toHaveBeenCalled();

    cleanup.resolve();
    await Promise.all([firstRequest, duplicateRequest]);

    expect(beforeInstall).toHaveBeenCalledTimes(1);
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it("maps updater download progress into the 30 to 88 install-progress range", async () => {
    const { manager, updater } = create_harness();
    const progressHandler = jest.fn((_payload: AppUpdateInstallProgressPayload) => undefined);

    manager.init();
    manager.setBeforeInstallHandler(async () => undefined);
    manager.setInstallProgressHandler(progressHandler);
    updater.emit("update-available", { version: "1.2.1" });
    updater.downloadUpdate.mockImplementation(async () => {
      updater.emit("download-progress", { percent: -20 });
      updater.emit("download-progress", { percent: 0 });
      updater.emit("download-progress", { percent: 50 });
      updater.emit("download-progress", { percent: 100 });
      updater.emit("download-progress", { percent: 140 });
      updater.emit("update-downloaded", { version: "1.2.1" });
      return undefined;
    });

    await manager.quitAndInstall();

    const downloadingProgress = progressHandler.mock.calls
      .map(([payload]) => payload)
      .filter((payload) => payload.stage === "downloading")
      .map((payload) => payload.progress);

    expect(downloadingProgress).toEqual([30, 30, 30, 59, 88, 88]);
    expect(downloadingProgress.every((progress) => progress >= 30 && progress <= 88)).toBe(true);
  });

  it("notifies cleanup failure and permits a later retry", async () => {
    const { manager, updater } = create_harness();
    const beforeInstall = jest
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("cleanup failed"))
      .mockResolvedValue(undefined);
    const installFailure = jest.fn();

    manager.init();
    manager.setBeforeInstallHandler(beforeInstall);
    manager.setInstallFailureHandler(installFailure);
    updater.emit("update-available", { version: "1.2.1" });

    await manager.quitAndInstall();

    expect(installFailure).toHaveBeenCalledTimes(1);
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    expect(manager.isInstallingUpdate()).toBe(false);

    updater.emit("update-available", { version: "1.2.1" });
    updater.downloadUpdate.mockImplementation(async () => {
      updater.emit("update-downloaded", { version: "1.2.1" });
      return undefined;
    });
    await manager.quitAndInstall();

    expect(beforeInstall).toHaveBeenCalledTimes(2);
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it("notifies download failure and permits a later retry", async () => {
    const { manager, updater } = create_harness();
    const installFailure = jest.fn();

    manager.init();
    manager.setBeforeInstallHandler(async () => undefined);
    manager.setInstallFailureHandler(installFailure);
    updater.emit("update-available", { version: "1.2.1" });
    updater.downloadUpdate.mockRejectedValueOnce(new Error("download failed"));

    await manager.quitAndInstall();

    expect(installFailure).toHaveBeenCalledTimes(1);
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    expect(manager.isInstallingUpdate()).toBe(false);

    updater.emit("update-available", { version: "1.2.1" });
    updater.downloadUpdate.mockImplementationOnce(async () => {
      updater.emit("update-downloaded", { version: "1.2.1" });
      return undefined;
    });
    await manager.quitAndInstall();

    expect(updater.downloadUpdate).toHaveBeenCalledTimes(2);
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });
});
