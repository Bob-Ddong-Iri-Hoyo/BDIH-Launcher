import { constants, closeSync, existsSync, mkdirSync, openSync, readSync, rmSync } from "fs";
import path from "path";
import { spawn } from "child_process";
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
  execution: HoyoOverseerExecutionDescriptor;
  onEvent: (event: HoyoOverseerEvent) => void | Promise<void>;
  onExit?: (code: number) => void;
  onError?: (error: Error) => void;
}

export interface HoyoOverseerExecutionDescriptor {
  command: string;
  args: string[];
  cwd: string;
  environment: Record<string, string>;
}

interface HoyoOverseerSession {
  processId: string;
  eventDir: string;
  fifoPath: string;
  eventSessionId: string;
  fd?: number;
  buffer: string;
  stderrBuffer: string;
  fatalError?: Error;
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
 * the correct profile/prefix. Command, arguments, runtime environment, and
 * working directory are supplied as a completed execution descriptor; this
 * manager only attaches the generated FIFO binding.
 */
export class WineOverseer {
  private readonly sessions = new Map<string, HoyoOverseerSession>();

  attachSessionEnvironment(
    processId: string,
    environment: Readonly<Record<string, string>>,
  ): Record<string, string> {
    const session = this.sessions.get(processId);

    if (!session || session.ended) {
      throw new Error(`HoYo overseer session is not active: ${processId}`);
    }

    return attach_hoyo_overseer_connection(
      environment,
      session.fifoPath,
      session.eventSessionId,
    );
  }

  async startHoyoPlay(request: StartHoyoOverseerRequest): Promise<{
    processId: string;
    eventSessionId: string;
    hostPid?: number;
  }> {
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
      stderrBuffer: "",
      ended: false,
      stop: async () => {
        await this.stopSession(request.processId);
      },
    };

    this.sessions.set(request.processId, session);
    this.scheduleRead(session, request);

    let runningProcess: ReturnType<typeof processManager.startProcess> | undefined;

    const process = processManager.startProcess(request.processId, {
      command: request.execution.command,
      args: request.execution.args,
      cwd: request.execution.cwd,
      env: attach_hoyo_overseer_connection(
        request.execution.environment,
        fifoPath,
        eventSessionId,
      ),
      onLog: (data) => logger.info("HoYoPlay overseer stdout", data.trim()),
      onError: (data) => {
        logger.warn("HoYoPlay overseer stderr", data.trim());
        session.stderrBuffer = `${session.stderrBuffer}${data}`.slice(-8192);

        const fatalMessage = wine_unhandled_page_fault_message(session.stderrBuffer);

        if (!fatalMessage || session.fatalError) {
          return;
        }

        session.fatalError = new Error(`HoYoPlay crashed in Wine: ${fatalMessage}`);
        logger.error("HoYoPlay overseer detected a fatal Wine exception", {
          processId: request.processId,
          error: session.fatalError.message,
        });
        request.onError?.(session.fatalError);
        void runningProcess?.Stop();
      },
    });
    runningProcess = process;

    process.done.then(
      (code) => {
        if (!session.fatalError) {
          request.onExit?.(code);
        }

        if (session.fatalError || code !== 0) {
          this.cleanupSession(request.processId);
          return;
        }

        // launcher.exe/HYP.exe can exit normally while HoYoPlay hands control
        // to HYUpdater.exe and then starts the updated HYP.exe. The FIFO belongs
        // to the Wine prefix session, so keep it attached until wineserver ends.
        logger.info("HoYoPlay bootstrap process exited; keeping overseer attached to prefix", {
          processId: request.processId,
          code,
        });
      },
      (error) => {
        if (!session.fatalError) {
          request.onError?.(error instanceof Error ? error : new Error(String(error)));
        }
        this.cleanupSession(request.processId);
      },
    );

    logger.info("HoYoPlay overseer started", {
      processId: request.processId,
      launcherPrefixPath: request.launcherPrefixPath,
      fifoPath,
      eventSessionId,
      command: request.execution.command,
      args: request.execution.args,
    });

    return {
      processId: request.processId,
      eventSessionId,
      hostPid: process.pid,
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

export function attach_hoyo_overseer_connection(
  environment: Readonly<Record<string, string>>,
  fifoPath: string,
  eventSessionId: string,
): Record<string, string> {
  return {
    ...environment,
    WINE_HOYO_EVENT_PIPE: wine_z_path(fifoPath),
    WINE_HOYO_EVENT_SESSION: eventSessionId,
  };
}

export function wine_unhandled_page_fault_message(stderr: string): string | undefined {
  const match = stderr.match(/wine:\s*Unhandled page fault[^\r\n]*/i);

  return match?.[0].trim();
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

function wine_z_path(hostPath: string): string {
  return `Z:${hostPath.replace(/\//g, "\\")}`;
}

export const wineOverseer = new WineOverseer();
