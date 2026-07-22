import { jest } from "@jest/globals";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";
import type { DxmtStatusPayload } from "../../../src/Common/Types/IPC";

describe("DxmtManager", () => {
  let tempRoot: string;
  let cacheRoot: string;
  let sourcePackagePath: string;
  let sendToWebContents: ReturnType<typeof jest.fn>;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "bdih-dxmt-manager-"));
    cacheRoot = path.join(tempRoot, "cache");
    sourcePackagePath = path.join(tempRoot, "dxmt-v0.80-builtin.tar.gz");
    sendToWebContents = jest.fn();

    // DxmtManager only needs a non-empty gzip package at this boundary. The
    // archive contents are validated later when a prefix runtime is prepared.
    await writeFile(sourcePackagePath, Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00]));

    jest.resetModules();
    jest.doMock("electron", () => ({}));
    jest.doMock("../../../src/Main/Runtime/GitHubReleaseCatalog", () => ({
      fetch_github_release_catalog: jest.fn(async () => [{
        id: "bdih-dxmt-v0-80",
        name: "v0.80",
        version: "v0.80",
        downloadUrl: pathToFileURL(sourcePackagePath).href,
      }]),
    }));
    jest.doMock("../../../src/Main/Manager/PreferenceManager", () => ({
      preferenceManager: {
        getPreference: jest.fn(async () => ({ dxmtCachePath: cacheRoot })),
      },
    }));
    jest.doMock("../../../src/Main/Manager/DownloadManager", () => ({
      downloadManager: { startDownload: jest.fn() },
    }));
    jest.doMock("../../../src/Main/Manager/LogManager", () => ({
      logManager: {
        createLogger: jest.fn(() => ({
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        })),
      },
    }));
    jest.doMock("../../../src/Main/Program/Xattr", () => ({
      remove_quarantine_xattr: jest.fn(async () => ({ ok: true, skipped: true })),
    }));
    jest.doMock("../../../src/Main/Util/SafeWebContents", () => ({
      send_to_web_contents: sendToWebContents,
    }));
  });

  afterEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("includes the downloaded package path in the installed status event", async () => {
    const { DxmtManager } = require("../../../src/Main/Manager/DxmtManager") as typeof import("../../../src/Main/Manager/DxmtManager");
    const manager = new DxmtManager();
    const [version] = await manager.getVersionList();

    await manager.installDxmt({
      versionId: version.id,
      installPath: cacheRoot,
    });

    const installedStatus = sendToWebContents.mock.calls
      .map((call) => call[2] as DxmtStatusPayload)
      .findLast((payload) => payload.status === "installed");

    expect(installedStatus).toEqual(expect.objectContaining({
      versionId: "bdih-dxmt-v0-80",
      path: path.join(cacheRoot, "dxmt-v0.80-builtin.tar.gz"),
    }));
  });
});
