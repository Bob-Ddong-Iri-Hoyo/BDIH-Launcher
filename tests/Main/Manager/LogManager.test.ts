import { jest } from "@jest/globals";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import {
  capture_manager_environment,
  create_manager_fixture_environment,
  ManagerFixtureEnvironment,
  remove_manager_fixture_environment,
  restore_manager_environment,
} from "../../fixtures/managerFixtures";

describe("LogManager", () => {
  let environment: ManagerFixtureEnvironment;
  let environmentSnapshot: ReturnType<typeof capture_manager_environment>;

  beforeEach(async () => {
    environmentSnapshot = capture_manager_environment();
    environment = await create_manager_fixture_environment();
    jest.resetModules();
  });

  afterEach(async () => {
    restore_manager_environment(environmentSnapshot);
    await remove_manager_fixture_environment(environment);
    jest.resetModules();
  });

  it("writes bottle logs and exposes them in snapshots", async () => {
    const consoleInfo = jest.spyOn(console, "info").mockImplementation(() => undefined);

    try {
      const { LogManager } = require("../../../src/Main/Manager/LogManager") as typeof import("../../../src/Main/Manager/LogManager");
      const manager = new LogManager();
      const entries: unknown[] = [];

      manager.init({
        logDir: environment.devLogRoot,
        sessionName: "2026-06-17_120000",
        patchConsole: false,
      });
      manager.onEntry((entry) => entries.push(entry));

      const logger = manager.createLogger({
        file: "wine",
        source: "unit",
        fileName: "wine-fixture-bottle__steam.log",
        sessionKind: "bottle",
        bottleId: "fixture:steam",
        bottleName: "Fixture Bottle",
      });

      logger.info("Steam launch prepared", { appId: "777" });

      const logFilePath = path.join(environment.devLogRoot, "2026-06-17_120000", "wine-fixture-bottle__steam.log");
      const logText = await readFile(logFilePath, "utf8");
      const snapshot = manager.getSnapshot();

      expect(entries).toHaveLength(1);
      expect(logText).toContain("[INFO] [unit] Steam launch prepared");
      expect(snapshot.sessions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "bottle",
            label: "Fixture Bottle / Steam",
            logFileName: "wine-fixture-bottle__steam.log",
          }),
        ]),
      );
      expect(snapshot.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: "wine",
            source: "unit",
            message: expect.stringContaining("Steam launch prepared"),
          }),
        ]),
      );
    } finally {
      consoleInfo.mockRestore();
    }
  });

  it("keeps existing and live bottle logs together across repeated display name changes", async () => {
    const consoleInfo = jest.spyOn(console, "info").mockImplementation(() => undefined);

    try {
      const { LogManager } = require("../../../src/Main/Manager/LogManager") as typeof import("../../../src/Main/Manager/LogManager");
      const manager = new LogManager();

      manager.init({
        logDir: environment.devLogRoot,
        sessionName: "2026-06-17_120500",
        patchConsole: false,
      });

      const originalLogger = manager.createLogger({
        file: "wine",
        source: "unit",
        fileName: "bottles/nahida/steam.log",
        sessionKind: "bottle",
        bottleId: "nahida-fixture",
        bottleName: "Nahida",
      });

      originalLogger.info("before first rename");
      manager.renameBottleLogs({
        bottleId: "nahida-fixture",
        previousBottleName: "Nahida",
        nextBottleName: "NahidaDD",
      });

      const middleLogger = manager.createLogger({
        file: "wine",
        source: "unit",
        fileName: "bottles/nahidadd/steam.log",
        sessionKind: "bottle",
        bottleId: "nahida-fixture",
        bottleName: "NahidaDD",
      });
      const finalLogger = manager.createLogger({
        file: "wine",
        source: "unit",
        fileName: "bottles/nahidadd3/steam.log",
        sessionKind: "bottle",
        bottleId: "nahida-fixture",
        bottleName: "NahidaDD3",
      });

      middleLogger.info("after first rename");
      finalLogger.info("existing final-name log");
      manager.renameBottleLogs({
        bottleId: "nahida-fixture",
        previousBottleName: "NahidaDD",
        nextBottleName: "NahidaDD3",
      });
      originalLogger.info("original logger after second rename");
      middleLogger.info("middle logger after second rename");

      const sessionDir = path.join(environment.devLogRoot, "2026-06-17_120500", "bottles");
      const finalLogPath = path.join(sessionDir, "nahidadd3", "steam.log");
      const finalLogText = await readFile(finalLogPath, "utf8");
      const bottleSessions = manager.getSnapshot().sessions.filter((session) => session.kind === "bottle");

      expect(existsSync(path.join(sessionDir, "nahida"))).toBe(false);
      expect(existsSync(path.join(sessionDir, "nahidadd"))).toBe(false);
      expect(finalLogText).toContain("before first rename");
      expect(finalLogText).toContain("after first rename");
      expect(finalLogText).toContain("existing final-name log");
      expect(finalLogText).toContain("original logger after second rename");
      expect(finalLogText).toContain("middle logger after second rename");
      expect(bottleSessions).toEqual([
        expect.objectContaining({
          logFileName: "bottles/nahidadd3/steam.log",
        }),
      ]);
    } finally {
      consoleInfo.mockRestore();
    }
  });

  it("does not write app log entries when the minimum level is off", async () => {
    const { LogManager, log_level_from_preference } = require("../../../src/Main/Manager/LogManager") as typeof import("../../../src/Main/Manager/LogManager");
    const manager = new LogManager();

    expect(log_level_from_preference("off")).toBe("off");
    expect(log_level_from_preference("all")).toBe("debug");

    manager.init({
      logDir: environment.devLogRoot,
      sessionName: "2026-06-17_121000",
      minLevel: "off",
      patchConsole: false,
    });

    const logger = manager.createLogger("unit");

    logger.error("hidden error");
    logger.warn("hidden warn");
    logger.info("hidden info");
    logger.debug("hidden debug");

    const logFilePath = path.join(environment.devLogRoot, "2026-06-17_121000", "app.log");

    expect(existsSync(logFilePath)).toBe(false);
    expect(manager.getSnapshot().entries).toEqual([]);
  });

  it("writes only entries at or above the selected app log level", async () => {
    const consoleInfo = jest.spyOn(console, "info").mockImplementation(() => undefined);
    const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { LogManager } = require("../../../src/Main/Manager/LogManager") as typeof import("../../../src/Main/Manager/LogManager");
    const manager = new LogManager();

    try {
      manager.init({
        logDir: environment.devLogRoot,
        sessionName: "2026-06-17_122000",
        minLevel: "info",
        patchConsole: false,
      });

      const logger = manager.createLogger("unit");

      logger.debug("filtered debug");
      logger.info("visible info");
      logger.warn("visible warn");
      logger.error("visible error");

      manager.setMinLevel("error");
      logger.warn("filtered warn after error level");
      logger.error("visible error after error level");

      const logFilePath = path.join(environment.devLogRoot, "2026-06-17_122000", "app.log");
      const logText = await readFile(logFilePath, "utf8");

      expect(logText).not.toContain("filtered debug");
      expect(logText).not.toContain("filtered warn after error level");
      expect(logText).toContain("[INFO] [unit] visible info");
      expect(logText).toContain("[WARN] [unit] visible warn");
      expect(logText).toContain("[ERROR] [unit] visible error");
      expect(logText).toContain("[ERROR] [unit] visible error after error level");
    } finally {
      consoleInfo.mockRestore();
      consoleWarn.mockRestore();
      consoleError.mockRestore();
    }
  });
});
