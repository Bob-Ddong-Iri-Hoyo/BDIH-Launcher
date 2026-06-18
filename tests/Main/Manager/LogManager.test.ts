import { jest } from "@jest/globals";
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
});
