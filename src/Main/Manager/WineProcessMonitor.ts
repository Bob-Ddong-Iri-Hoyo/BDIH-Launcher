import {
  constants,
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  rmSync,
} from "fs";
import { Socket } from "net";
import path from "path";
import { spawnSync } from "child_process";
import { logManager } from "./LogManager";

export type WineProcessEventType = "start" | "system" | "exit";
export type WineServerEventType = "server_start" | "server_stop";

export interface WineProcessEvent {
  schema: "bdih.wine.process.v1";
  type: WineProcessEventType;
  serverPid: number;
  sequence: number;
  winePid: number;
  parentWinePid: number;
  unixPid: number;
  isSystem: boolean;
  startTimeTicks: string;
  exitCode?: number;
  imagePath?: string;
  commandLine?: string;
  workingDirectory?: string;
  steamAppId?: string;
}

export interface WineServerEvent {
  schema: "bdih.wine.process.v1";
  type: WineServerEventType;
  serverPid: number;
  sequence: number;
}

export type WineTelemetryEvent = WineProcessEvent | WineServerEvent;

export interface WineProcessSnapshot {
  prefixPath: string;
  telemetryReceived: boolean;
  serverRunning: boolean;
  processes: WineProcessEvent[];
}

type WineProcessListener = (
  event: WineTelemetryEvent,
  snapshot: WineProcessSnapshot,
) => void;

interface WineProcessMonitorSession {
  prefixPath: string;
  eventDir: string;
  fifoPath: string;
  stream: Socket;
  buffer: string;
  serverPid?: number;
  telemetryReceived: boolean;
  serverRunning: boolean;
  processes: Map<number, WineProcessEvent>;
  listeners: Set<WineProcessListener>;
  closed: boolean;
}

const PROCESS_EVENT_DIR = path.join(".cache", "bdih-process-monitor");
const PROCESS_EVENT_FIFO = "process-events.fifo";
const PROCESS_EVENT_MAX_LINE_CHARS = 256 * 1024;
const logger = logManager.createLogger({ file: "wine", source: "process-monitor" });

/**
 * Receives authoritative process lifecycle events from the patched wineserver.
 *
 * One FIFO is owned per Wine prefix. The environment binding must be present
 * before that prefix's wineserver starts because a running wineserver keeps the
 * environment inherited by its first client.
 */
export class WineProcessMonitor {
  private readonly sessions = new Map<string, WineProcessMonitorSession>();

  prepareEnvironment(prefixPath: string): Record<string, string> {
    const session = this.ensureSession(prefixPath);

    return {
      WINE_BDIH_PROCESS_TELEMETRY: "1",
      WINE_BDIH_PROCESS_PIPE: session.fifoPath,
    };
  }

  subscribe(prefixPath: string, listener: WineProcessListener): () => void {
    const session = this.ensureSession(prefixPath);
    session.listeners.add(listener);

    return () => {
      session.listeners.delete(listener);
    };
  }

  snapshot(prefixPath: string): WineProcessSnapshot {
    const normalizedPrefixPath = normalize_prefix_path(prefixPath);
    const session = this.sessions.get(normalizedPrefixPath);

    if (!session) {
      return {
        prefixPath: normalizedPrefixPath,
        telemetryReceived: false,
        serverRunning: false,
        processes: [],
      };
    }

    return create_snapshot(session);
  }

  close(prefixPath: string): void {
    const normalizedPrefixPath = normalize_prefix_path(prefixPath);
    const session = this.sessions.get(normalizedPrefixPath);

    if (!session || session.closed) {
      return;
    }

    session.closed = true;
    session.stream.removeAllListeners();
    session.stream.destroy();
    rmSync(session.eventDir, { recursive: true, force: true });
    this.sessions.delete(normalizedPrefixPath);
  }

  private ensureSession(prefixPath: string): WineProcessMonitorSession {
    const normalizedPrefixPath = normalize_prefix_path(prefixPath);
    const existing = this.sessions.get(normalizedPrefixPath);

    if (existing && !existing.closed) {
      return existing;
    }

    const eventDir = path.join(normalizedPrefixPath, PROCESS_EVENT_DIR);
    const fifoPath = path.join(eventDir, PROCESS_EVENT_FIFO);

    mkdirSync(eventDir, { recursive: true });
    rmSync(fifoPath, { force: true });
    create_fifo_sync(fifoPath);

    const fd = openSync(fifoPath, constants.O_RDWR | constants.O_NONBLOCK);
    let stream: Socket;

    try {
      stream = new Socket({
        fd,
        readable: true,
        writable: false,
      });
    } catch (error) {
      closeSync(fd);
      throw error;
    }

    const session: WineProcessMonitorSession = {
      prefixPath: normalizedPrefixPath,
      eventDir,
      fifoPath,
      stream,
      buffer: "",
      telemetryReceived: false,
      serverRunning: false,
      processes: new Map(),
      listeners: new Set(),
      closed: false,
    };

    this.sessions.set(normalizedPrefixPath, session);
    stream.on("data", (chunk: Buffer) => {
      this.applyEventChunk(session, chunk);
    });
    stream.on("error", (error) => {
      if (!session.closed) {
        logger.warn("Wine process event stream failed", {
          prefixPath: session.prefixPath,
          error: error.message,
        });
      }
    });
    stream.unref();
    logger.info("Wine process monitor prepared", {
      prefixPath: normalizedPrefixPath,
      fifoPath,
    });
    return session;
  }

  private applyEventChunk(session: WineProcessMonitorSession, chunk: Buffer): void {
    if (session.closed) {
      return;
    }

    session.buffer += chunk.toString("utf8");
    this.flushEventLines(session);
    if (session.buffer.length > PROCESS_EVENT_MAX_LINE_CHARS) {
      logger.warn("Discarded oversized incomplete Wine process event", {
        prefixPath: session.prefixPath,
        bufferedCharacters: session.buffer.length,
      });
      session.buffer = "";
    }
  }

  private flushEventLines(session: WineProcessMonitorSession): void {
    const lines = session.buffer.split(/\r?\n/);
    session.buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.length > PROCESS_EVENT_MAX_LINE_CHARS) {
        logger.warn("Ignored oversized Wine process event", {
          prefixPath: session.prefixPath,
          characters: line.length,
        });
        continue;
      }

      const event = parse_wine_process_event(line);

      if (!event) {
        logger.warn("Ignored malformed Wine process event", {
          prefixPath: session.prefixPath,
          characters: line.length,
        });
        continue;
      }

      this.applyEvent(session, event);
    }
  }

  private applyEvent(session: WineProcessMonitorSession, event: WineTelemetryEvent): void {
    if (session.serverPid !== undefined && session.serverPid !== event.serverPid) {
      session.processes.clear();
      logger.info("Wine process server changed; discarded stale process state", {
        prefixPath: session.prefixPath,
        previousServerPid: session.serverPid,
        serverPid: event.serverPid,
      });
    }

    session.serverPid = event.serverPid;
    session.telemetryReceived = true;

    if (event.type === "server_start") {
      session.serverRunning = true;
    } else if (event.type === "server_stop") {
      session.serverRunning = false;
      session.processes.clear();
    } else {
      session.serverRunning = true;
      if (event.type === "exit") {
        session.processes.delete(event.winePid);
      } else {
        const previous = session.processes.get(event.winePid);
        session.processes.set(event.winePid, {
          ...previous,
          ...event,
        });
      }
    }

    const snapshot = create_snapshot(session);
    if (event.type === "server_start" || event.type === "server_stop") {
      logger.debug(`Wine server ${event.type}`, {
        prefixPath: session.prefixPath,
        serverPid: event.serverPid,
        activeProcessCount: snapshot.processes.length,
      });
    } else {
      logger.debug(`Wine process ${event.type}`, {
        prefixPath: session.prefixPath,
        winePid: event.winePid,
        parentWinePid: event.parentWinePid,
        unixPid: event.unixPid,
        imagePath: event.imagePath,
        steamAppId: event.steamAppId,
        exitCode: event.exitCode,
        activeProcessCount: snapshot.processes.length,
      });
    }

    for (const listener of session.listeners) {
      try {
        listener(event, snapshot);
      } catch (error) {
        logger.warn("Wine process listener failed", {
          prefixPath: session.prefixPath,
          winePid: "winePid" in event ? event.winePid : undefined,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

export function parse_wine_process_event(line: string): WineTelemetryEvent | undefined {
  const trimmedLine = line.trim();

  if (!trimmedLine) {
    return undefined;
  }

  try {
    const raw = JSON.parse(trimmedLine) as Record<string, unknown>;
    const type = raw.type;

    if (
      raw.schema !== "bdih.wine.process.v1"
      || !is_finite_number(raw.serverPid)
      || !is_finite_number(raw.sequence)
    ) {
      return undefined;
    }

    if (type === "server_start" || type === "server_stop") {
      return {
        schema: "bdih.wine.process.v1",
        type,
        serverPid: raw.serverPid,
        sequence: raw.sequence,
      };
    }

    if (
      (type !== "start" && type !== "system" && type !== "exit")
      || !is_finite_number(raw.winePid)
      || !is_finite_number(raw.parentWinePid)
      || !is_finite_number(raw.unixPid)
      || typeof raw.isSystem !== "boolean"
      || !is_integer_string(raw.startTimeTicks)
    ) {
      return undefined;
    }

    return {
      schema: "bdih.wine.process.v1",
      type,
      serverPid: raw.serverPid,
      sequence: raw.sequence,
      winePid: raw.winePid,
      parentWinePid: raw.parentWinePid,
      unixPid: raw.unixPid,
      isSystem: raw.isSystem,
      startTimeTicks: raw.startTimeTicks,
      exitCode: is_finite_number(raw.exitCode) ? raw.exitCode : undefined,
      imagePath: optional_string(raw.imagePath),
      commandLine: optional_string(raw.commandLine),
      workingDirectory: optional_string(raw.workingDirectory),
      steamAppId: optional_string(raw.steamAppId),
    };
  } catch {
    return undefined;
  }
}

function create_snapshot(session: WineProcessMonitorSession): WineProcessSnapshot {
  return {
    prefixPath: session.prefixPath,
    telemetryReceived: session.telemetryReceived,
    serverRunning: session.serverRunning,
    processes: [...session.processes.values()].sort((left, right) => left.winePid - right.winePid),
  };
}

function create_fifo_sync(fifoPath: string): void {
  const result = spawnSync("mkfifo", [fifoPath], {
    env: process.env,
    shell: false,
    windowsHide: true,
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 && !existsSync(fifoPath)) {
    throw new Error(
      `mkfifo exited with code ${result.status ?? "unknown"}: ${fifoPath} ${result.stderr.trim()}`,
    );
  }
  chmodSync(fifoPath, 0o600);
}

function normalize_prefix_path(prefixPath: string): string {
  return path.resolve(prefixPath);
}

function is_finite_number(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function is_integer_string(value: unknown): value is string {
  return typeof value === "string" && /^-?\d+$/.test(value);
}

function optional_string(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

export const wineProcessMonitor = new WineProcessMonitor();
