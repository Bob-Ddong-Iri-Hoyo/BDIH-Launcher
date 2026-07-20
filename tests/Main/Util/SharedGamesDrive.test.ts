import { mkdtemp, mkdir, readFile, readlink, rm, symlink, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { ensure_shared_games_drive } from "../../../src/Main/Util/SharedGamesDrive";

describe("shared games G: drive mapping", () => {
  let rootPath: string;
  let prefixPath: string;
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
  };

  beforeEach(async () => {
    rootPath = await mkdtemp(path.join(os.tmpdir(), "bdih-shared-games-"));
    prefixPath = path.join(rootPath, "steam-prefix");
    await mkdir(path.join(prefixPath, "dosdevices"), { recursive: true });
    logger.info.mockClear();
    logger.warn.mockClear();
  });

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true });
  });

  it("creates a managed G: link for an existing prefix", async () => {
    const gamesPath = path.join(rootPath, "Games");

    ensure_shared_games_drive(prefixPath, { gameInstallPath: gamesPath }, logger);

    await expect(readlink(path.join(prefixPath, "dosdevices", "g:"))).resolves.toBe(gamesPath);
    await expect(readFile(path.join(prefixPath, ".bdih-shared-games-drive.json"), "utf8"))
      .resolves.toContain(gamesPath);
  });

  it("replaces a previous launcher-managed G: target after settings change", async () => {
    const previousGamesPath = path.join(rootPath, "OldGames");
    const nextGamesPath = path.join(rootPath, "NewGames");

    ensure_shared_games_drive(prefixPath, { gameInstallPath: previousGamesPath }, logger);
    ensure_shared_games_drive(prefixPath, { gameInstallPath: nextGamesPath }, logger);

    await expect(readlink(path.join(prefixPath, "dosdevices", "g:"))).resolves.toBe(nextGamesPath);
  });

  it("does not overwrite a G: link that was not created by the launcher", async () => {
    const manualGamesPath = path.join(rootPath, "ManualGames");
    const requestedGamesPath = path.join(rootPath, "RequestedGames");
    await mkdir(manualGamesPath, { recursive: true });
    await symlink(manualGamesPath, path.join(prefixPath, "dosdevices", "g:"));

    ensure_shared_games_drive(prefixPath, { gameInstallPath: requestedGamesPath }, logger);

    await expect(readlink(path.join(prefixPath, "dosdevices", "g:"))).resolves.toBe(manualGamesPath);
    expect(logger.warn).toHaveBeenCalled();
  });
});
