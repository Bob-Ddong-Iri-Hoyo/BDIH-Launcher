import { constants, closeSync, existsSync, mkdirSync, openSync, readSync, rmSync } from "fs";
import path from "path";
import { spawn } from "child_process";
import type { BottleLaunchOptionsPayload } from "../../Common/Types/IPC";
import { logManager } from "./LogManager";
import { processManager } from "./ProcessManager";

export type HoyoOverseerGame = "zzz" | "hsr" | "genshin";

export interface HoyoOverseerEvent {
  game: HoyoOverseerGame;
  targetWin: string;
  stubArgs: string[];
  raw: Record<string, unknown>;
}

export interface StartHoyoOverseerRequest {
  processId: string;
  launcherPrefixPath: string;
  wineCommand: string;
  wineBinCommand: string;
  wineserverCommand: string;
  wineRootPath: string;
  hoyoplayExecutablePath: string;
  dataRootPath: string;
  launchOptions: BottleLaunchOptionsPayload;
  wineDebug?: string;
  onEvent: (event: HoyoOverseerEvent) => void | Promise<void>;
  onExit?: (code: number) => void;
  onError?: (error: Error) => void;
}

interface HoyoOverseerSession {
  processId: string;
  eventDir: string;
  fifoPath: string;
  eventSessionId: string;
  fd?: number;
  buffer: string;
  readTimer?: NodeJS.Timeout;
  ended: boolean;
  stop: () => Promise<void>;
}

const logger = logManager.createLogger({ file: "wine", source: "overseer" });

/**
 * Owns HoYoPlay FIFO supervision.
 *
 * Patched BDHI Wine can write a JSON launch event to `WINE_HOYO_EVENT_PIPE`
 * when HoYoPlay attempts to spawn a game process. WineOverseer keeps that FIFO
 * alive, parses events, and lets BottleExecutionManager dispatch the game into
 * the correct profile/prefix.
 */
export class WineOverseer {
  private readonly sessions = new Map<string, HoyoOverseerSession>();

  async startHoyoPlay(request: StartHoyoOverseerRequest): Promise<{ processId: string; eventSessionId: string }> {
    if (this.sessions.has(request.processId)) {
      throw new Error(`HoYo overseer is already running: ${request.processId}`);
    }

    const eventSessionId = `hoyo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const eventDir = path.join(request.launcherPrefixPath, ".cache", "overseer", eventSessionId);
    const fifoPath = path.join(eventDir, "hoyo.fifo");

    mkdirSync(eventDir, { recursive: true });
    rmSync(fifoPath, { force: true });
    await create_fifo(fifoPath);

    const fd = openSync(fifoPath, constants.O_RDWR | constants.O_NONBLOCK);
    const session: HoyoOverseerSession = {
      processId: request.processId,
      eventDir,
      fifoPath,
      eventSessionId,
      fd,
      buffer: "",
      ended: false,
      stop: async () => {
        await this.stopSession(request.processId);
      },
    };

    this.sessions.set(request.processId, session);
    this.scheduleRead(session, request);

    const process = processManager.startProcess(request.processId, {
      command: request.wineCommand,
      args: [
        windows_path_from_host(request.launcherPrefixPath, request.hoyoplayExecutablePath),
        ...hoyoplay_args_from_options(request.launchOptions),
      ],
      cwd: request.launcherPrefixPath,
      env: create_hoyoplay_overseer_env(request, fifoPath, eventSessionId),
      onLog: (data) => logger.info("HoYoPlay overseer stdout", data.trim()),
      onError: (data) => logger.warn("HoYoPlay overseer stderr", data.trim()),
    });

    process.done.then(
      (code) => {
        request.onExit?.(code);
        this.cleanupSession(request.processId);
      },
      (error) => {
        request.onError?.(error instanceof Error ? error : new Error(String(error)));
        this.cleanupSession(request.processId);
      },
    );

    logger.info("HoYoPlay overseer started", {
      processId: request.processId,
      launcherPrefixPath: request.launcherPrefixPath,
      fifoPath,
      eventSessionId,
      hoyoplayExecutablePath: request.hoyoplayExecutablePath,
    });

    return {
      processId: request.processId,
      eventSessionId,
    };
  }

  async stopSession(processId: string): Promise<void> {
    const session = this.sessions.get(processId);

    if (!session) {
      await processManager.stopProcess(processId);
      return;
    }

    await processManager.stopProcess(processId);
    this.cleanupSession(processId);
  }

  private scheduleRead(session: HoyoOverseerSession, request: StartHoyoOverseerRequest): void {
    if (session.ended) {
      return;
    }

    session.readTimer = setTimeout(() => {
      this.readAvailableEvents(session, request);
      this.scheduleRead(session, request);
    }, 200);
    session.readTimer.unref?.();
  }

  private readAvailableEvents(session: HoyoOverseerSession, request: StartHoyoOverseerRequest): void {
    if (session.ended || session.fd === undefined) {
      return;
    }

    const chunk = Buffer.alloc(8192);

    while (!session.ended) {
      let readBytes = 0;

      try {
        readBytes = readSync(session.fd, chunk, 0, chunk.length, null);
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error
          ? String((error as NodeJS.ErrnoException).code)
          : "";

        if (code !== "EAGAIN" && code !== "EWOULDBLOCK") {
          logger.warn("failed to read HoYo FIFO", {
            processId: session.processId,
            fifoPath: session.fifoPath,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (readBytes <= 0) {
        return;
      }

      session.buffer += chunk.toString("utf8", 0, readBytes);
      this.flushEventLines(session, request);
    }
  }

  private flushEventLines(session: HoyoOverseerSession, request: StartHoyoOverseerRequest): void {
    const lines = session.buffer.split(/\r?\n/);

    session.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const event = parse_hoyo_event(line, session.eventSessionId);

      if (!event) {
        continue;
      }

      logger.info("HoYo FIFO event received", {
        processId: session.processId,
        game: event.game,
        targetWin: event.targetWin,
      });
      Promise.resolve(request.onEvent(event)).catch((error) => {
        logger.error("HoYo FIFO event dispatch failed", {
          processId: session.processId,
          game: event.game,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  private cleanupSession(processId: string): void {
    const session = this.sessions.get(processId);

    if (!session || session.ended) {
      return;
    }

    session.ended = true;
    if (session.readTimer) {
      clearTimeout(session.readTimer);
    }
    if (session.fd !== undefined) {
      try {
        closeSync(session.fd);
      } catch {
        // Best-effort cleanup. The process/fifo may already be gone.
      }
    }
    rmSync(session.eventDir, { recursive: true, force: true });
    this.sessions.delete(processId);
    logger.info("HoYoPlay overseer cleaned up", {
      processId,
      eventDir: session.eventDir,
    });
  }
}

function create_hoyoplay_overseer_env(
  request: StartHoyoOverseerRequest,
  fifoPath: string,
  eventSessionId: string,
): Record<string, string> {
  const env: Record<string, string> = {
    WINEPREFIX: request.launcherPrefixPath,
    LOG_ROOT: path.join(request.dataRootPath, "logs"),
    WINEDEBUG: request.wineDebug ?? "-all",
    WINEMSYNC: request.launchOptions.enableMsync ? "1" : "0",
    WINELOADER: request.wineBinCommand,
    WINESERVER: request.wineserverCommand,
    WINE_HOYO_CHILD_STUB: "1",
    WINE_HOYO_STUB_ZZZ: "C:\\windows\\system32\\steam.exe",
    WINE_HOYO_STUB_STARRAIL: "C:\\windows\\system32\\steam.exe",
    WINE_HOYO_STUB_GENSHIN: "C:\\windows\\system32\\steam.exe",
    WINE_HOYO_STUB_LOG: "C:\\hoyo-route.log",
    WINE_HOYO_GENSHIN_ARGS_DISABLE: "1",
    WINE_HOYO_EVENT_PIPE: wine_z_path(fifoPath),
    WINE_HOYO_EVENT_SESSION: eventSessionId,
    WINE_HOYO_STUB_DROP_ARGS: "0",
    WINE_HOYO_STUB_TERMINATE_PARENT: "0",
    WINE_HOYO_STUB_LOG_ONLY: "1",
    WINE_HOYO_STUB_ROUTE_ONLY: "0",
    WINE_HOYO_STUB_REPORT_DISABLE: "1",
    WINE_HOYO_SET_STEAM_ENV: "0",
    WINE_ENABLE_TIMEOUT_FIX: "1",
    WINE_HOYOPLAY_ARGS: request.launchOptions.hoyoplayInProcessGpu === false ? "" : "--in-process-gpu",
    WINEDLLPATH: path.join(request.wineRootPath, "lib", "wine", "x86_64-unix"),
    WINEDATADIR: path.join(request.wineRootPath, "share", "wine"),
    DYLD_LIBRARY_PATH: prepend_env_path(path.join(request.wineRootPath, "lib"), process.env.DYLD_LIBRARY_PATH),
    DYLD_FALLBACK_LIBRARY_PATH: prepend_env_path(path.join(request.wineRootPath, "lib"), process.env.DYLD_FALLBACK_LIBRARY_PATH),
    VK_ICD_FILENAMES: path.join(request.wineRootPath, "share", "vulkan", "icd.d", "MoltenVK_icd.json"),
    VK_DRIVER_FILES: path.join(request.wineRootPath, "share", "vulkan", "icd.d", "MoltenVK_icd.json"),
  };

  if (typeof request.launchOptions.superviseWaitSeconds === "number") {
    env.SUPERVISE_STEAM_WAIT_SECONDS = String(request.launchOptions.superviseWaitSeconds);
  }
  if (request.launchOptions.allowDuplicateGame !== undefined) {
    env.SUPERVISOR_ALLOW_DUPLICATE_GAME = request.launchOptions.allowDuplicateGame ? "1" : "0";
  }
  for (const variable of request.launchOptions.environmentVariables ?? []) {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable.name)) {
      env[variable.name] = variable.value;
    }
  }

  return env;
}

function parse_hoyo_event(line: string, expectedSessionId: string): HoyoOverseerEvent | undefined {
  const trimmedLine = line.trim();

  if (!trimmedLine) {
    return undefined;
  }

  try {
    const raw = JSON.parse(trimmedLine) as Record<string, unknown>;
    const session = typeof raw.session === "string" ? raw.session : "";

    if (session && session !== expectedSessionId) {
      return undefined;
    }

    const game = normalize_hoyo_game(raw.game);
    const targetWin = typeof raw.targetWin === "string" ? raw.targetWin : "";

    if (!game || !targetWin) {
      return undefined;
    }

    return {
      game,
      targetWin,
      stubArgs: split_cmdline_args(typeof raw.stubArgs === "string" ? raw.stubArgs : ""),
      raw,
    };
  } catch {
    logger.warn("ignored malformed HoYo FIFO event", { line: trimmedLine });
    return undefined;
  }
}

function normalize_hoyo_game(value: unknown): HoyoOverseerGame | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  switch (value.toLowerCase()) {
    case "zzz":
    case "zenless":
      return "zzz";
    case "starrail":
    case "hsr":
    case "sr":
      return "hsr";
    case "genshin":
    case "gi":
    case "ys":
      return "genshin";
    default:
      return undefined;
  }
}

function hoyoplay_args_from_options(options: BottleLaunchOptionsPayload): string[] {
  if (options.hoyoplayInProcessGpu === false) {
    return [];
  }

  return ["--in-process-gpu"];
}

function split_cmdline_args(text: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuote = false;
  let hasToken = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (!inQuote && /\s/.test(character)) {
      if (current || hasToken) {
        args.push(current);
        current = "";
        hasToken = false;
      }
      continue;
    }

    if (character === "\"") {
      inQuote = !inQuote;
      hasToken = true;
      continue;
    }

    if (character === "\\" && (next === "\"" || next === "\\")) {
      current += next;
      index += 1;
      hasToken = true;
      continue;
    }

    current += character;
    hasToken = true;
  }

  if (current || hasToken) {
    args.push(current);
  }

  return args;
}

function create_fifo(fifoPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("mkfifo", [fifoPath], {
      env: process.env,
      shell: false,
      windowsHide: true,
    });

    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0 || existsSync(fifoPath)) {
        resolve();
        return;
      }

      reject(new Error(`mkfifo exited with code ${code ?? "unknown"}: ${fifoPath}`));
    });
  });
}

function windows_path_from_host(prefixPath: string, hostPath: string): string {
  const driveCPath = path.join(prefixPath, "drive_c");
  const relativePath = path.relative(driveCPath, hostPath);

  if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return `C:\\${relativePath.split(path.sep).join("\\")}`;
  }

  return wine_z_path(hostPath);
}

function wine_z_path(hostPath: string): string {
  return `Z:${hostPath.replace(/\//g, "\\")}`;
}

function prepend_env_path(nextPath: string, currentValue?: string): string {
  return currentValue ? `${nextPath}${path.delimiter}${currentValue}` : nextPath;
}

export const wineOverseer = new WineOverseer();
