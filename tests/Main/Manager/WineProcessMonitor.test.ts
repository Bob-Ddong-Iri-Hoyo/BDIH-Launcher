import {
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import os from "os";
import path from "path";
import {
  parse_wine_process_event,
  WineProcessMonitor,
} from "../../../src/Main/Manager/WineProcessMonitor";

describe("WineProcessMonitor", () => {
  it("parses a Wine process start event", () => {
    expect(parse_wine_process_event(JSON.stringify({
      schema: "bdih.wine.process.v1",
      type: "start",
      serverPid: 101,
      sequence: 4,
      winePid: 32,
      parentWinePid: 24,
      unixPid: 12345,
      isSystem: false,
      startTimeTicks: "133700000000000001",
      exitCode: null,
      imagePath: "\\\\?\\G:\\SteamLibrary\\Game\\Game.exe",
      commandLine: "\"G:\\SteamLibrary\\Game\\Game.exe\" -windowed",
      workingDirectory: "G:\\SteamLibrary\\Game",
      steamAppId: "123456",
    }))).toEqual({
      schema: "bdih.wine.process.v1",
      type: "start",
      serverPid: 101,
      sequence: 4,
      winePid: 32,
      parentWinePid: 24,
      unixPid: 12345,
      isSystem: false,
      startTimeTicks: "133700000000000001",
      exitCode: undefined,
      imagePath: "\\\\?\\G:\\SteamLibrary\\Game\\Game.exe",
      commandLine: "\"G:\\SteamLibrary\\Game\\Game.exe\" -windowed",
      workingDirectory: "G:\\SteamLibrary\\Game",
      steamAppId: "123456",
    });
  });

  it("parses process exit codes and rejects unrelated payloads", () => {
    const exitEvent = parse_wine_process_event(JSON.stringify({
      schema: "bdih.wine.process.v1",
      type: "exit",
      serverPid: 101,
      sequence: 5,
      winePid: 32,
      parentWinePid: 24,
      unixPid: 12345,
      isSystem: false,
      startTimeTicks: "133700000000000001",
      exitCode: 7,
    }));

    expect(exitEvent?.type).toBe("exit");
    expect(exitEvent?.type === "exit" ? exitEvent.exitCode : undefined).toBe(7);
    expect(parse_wine_process_event(JSON.stringify({
      schema: "bdih.wine.process.v1",
      type: "server_stop",
      serverPid: 101,
      sequence: 6,
    }))).toEqual({
      schema: "bdih.wine.process.v1",
      type: "server_stop",
      serverPid: 101,
      sequence: 6,
    });

    expect(parse_wine_process_event("{\"schema\":\"other\"}")).toBeUndefined();
    expect(parse_wine_process_event("not json")).toBeUndefined();
  });

  it("tracks live processes from the prefix FIFO", async () => {
    const prefixPath = mkdtempSync(path.join(os.tmpdir(), "bdih-wine-process-monitor-"));
    const monitor = new WineProcessMonitor();
    const environment = monitor.prepareEnvironment(prefixPath);
    const fifoPath = environment.WINE_BDIH_PROCESS_PIPE;
    const event = {
      schema: "bdih.wine.process.v1",
      type: "start",
      serverPid: 101,
      sequence: 2,
      winePid: 32,
      parentWinePid: 24,
      unixPid: 12345,
      isSystem: false,
      startTimeTicks: "133700000000000001",
      exitCode: null,
      imagePath: "C:\\Game\\Game.exe",
      commandLine: "Game.exe",
      workingDirectory: "C:\\Game",
      steamAppId: "123456",
    };

    try {
      expect(environment.WINE_BDIH_PROCESS_TELEMETRY).toBe("1");
      expect(statSync(fifoPath).mode & 0o777).toBe(0o600);
      writeFileSync(fifoPath, `${JSON.stringify({
        schema: "bdih.wine.process.v1",
        type: "server_start",
        serverPid: 101,
        sequence: 1,
      })}\n`);
      await wait_for_stream_event();
      expect(monitor.snapshot(prefixPath).serverRunning).toBe(true);

      writeFileSync(fifoPath, `${JSON.stringify(event)}\n`);
      await wait_for_stream_event();
      expect(monitor.snapshot(prefixPath).processes).toHaveLength(1);

      writeFileSync(fifoPath, `${JSON.stringify({
        ...event,
        type: "exit",
        sequence: 3,
        exitCode: 0,
      })}\n`);
      await wait_for_stream_event();
      expect(monitor.snapshot(prefixPath).processes).toHaveLength(0);
      expect(monitor.snapshot(prefixPath).serverRunning).toBe(true);

      writeFileSync(fifoPath, `${JSON.stringify({
        schema: "bdih.wine.process.v1",
        type: "server_stop",
        serverPid: 101,
        sequence: 4,
      })}\n`);
      await wait_for_stream_event();
      expect(monitor.snapshot(prefixPath).serverRunning).toBe(false);
    } finally {
      monitor.close(prefixPath);
      rmSync(prefixPath, { recursive: true, force: true });
    }
  });
});

function wait_for_stream_event(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}
