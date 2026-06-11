import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "fs";
import path from "path";
import util from "util";
import {
  LauncherLogEntryPayload,
  LauncherLogSnapshotPayload,
  LauncherLogSourcePayload,
} from "../../Common/Types/IPC";
import { get_default_log_dir } from "../Environment/AppPaths";

export type LogLevel = "debug" | "info" | "warn" | "error" | "off";
export type LogFileCategory = "app" | "wine";

export interface LogManagerOptions {
  logDir?: string;
  sessionName?: string;
  maxFileBytes?: number;
  maxBackupFiles?: number;
  minLevel?: LogLevel;
  patchConsole?: boolean;
}

export interface LoggerOptions {
  file: LogFileCategory;
  source: string;
  fileName?: string;
  sessionId?: string;
  sessionLabel?: string;
  sessionKind?: "app" | "bottle";
  bottleId?: string;
  bottleName?: string;
}

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export type LogEntryListener = (entry: LauncherLogEntryPayload) => void;

type DiscoveredLogSession = Omit<LauncherLogSnapshotPayload["sessions"][number], "logDirectoryPath" | "logFileName"> & {
  category: LogFileCategory;
  logDirectoryPath: string;
  logFileName: string;
};

const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  off: 50,
};

const DEFAULT_OPTIONS: Required<Omit<LogManagerOptions, "logDir" | "sessionName">> = {
  maxFileBytes: 5 * 1024 * 1024,
  maxBackupFiles: 5,
  minLevel: "debug",
  patchConsole: true,
};

export class LogManager {
  private initialized = false;
  private options: Required<LogManagerOptions> | null = null;
  private originalConsole: Pick<Console, "debug" | "info" | "log" | "warn" | "error"> | null = null;
  private listeners = new Set<LogEntryListener>();
  private entrySequence = 0;

  init(options: LogManagerOptions = {}): void {
    if (this.initialized) {
      return;
    }

    const sessionName = options.sessionName ?? create_log_session_name();
    const logDir = path.join(options.logDir ?? this.resolveDefaultLogDir(), sessionName);
    const resolvedOptions: Required<LogManagerOptions> = {
      ...DEFAULT_OPTIONS,
      ...options,
      logDir,
      sessionName,
    };

    mkdirSync(resolvedOptions.logDir, { recursive: true });
    this.options = resolvedOptions;

    if (resolvedOptions.patchConsole) {
      this.patchConsole();
    }

    process.on("uncaughtException", (error) => {
      this.write(normalize_logger_options("process"), "error", "error", ["uncaughtException", error]);
    });

    process.on("unhandledRejection", (reason) => {
      this.write(normalize_logger_options("process"), "error", "error", ["unhandledRejection", reason]);
    });

    this.initialized = true;
    this.info("LogManager", "initialized", {
      appLogFile: this.getLogFilePath("app"),
      wineLogFile: this.getLogFilePath("wine"),
    });
  }

  createLogger(scopeOrOptions: string | LoggerOptions): Logger {
    const loggerOptions = normalize_logger_options(scopeOrOptions);

    return {
      debug: (...args) => this.write(loggerOptions, "debug", "debug", args),
      info: (...args) => this.write(loggerOptions, "info", "info", args),
      warn: (...args) => this.write(loggerOptions, "warn", "warn", args),
      error: (...args) => this.write(loggerOptions, "error", "error", args),
    };
  }

  setMinLevel(minLevel: LogLevel): void {
    const options = this.requireOptions();
    this.options = {
      ...options,
      minLevel,
    };
  }

  debug(scope: string, ...args: unknown[]): void {
    this.write(normalize_logger_options(scope), "debug", "debug", args);
  }

  info(scope: string, ...args: unknown[]): void {
    this.write(normalize_logger_options(scope), "info", "info", args);
  }

  warn(scope: string, ...args: unknown[]): void {
    this.write(normalize_logger_options(scope), "warn", "warn", args);
  }

  error(scope: string, ...args: unknown[]): void {
    this.write(normalize_logger_options(scope), "error", "error", args);
  }

  getSessionDir(): string {
    return this.requireOptions().logDir;
  }

  getSessionName(): string {
    return this.requireOptions().sessionName;
  }

  getLogFilePath(category: LogFileCategory): string {
    const options = this.requireOptions();
    return path.join(options.logDir, `${category}.log`);
  }

  private getLoggerLogFilePath(loggerOptions: LoggerOptions): string {
    const options = this.requireOptions();
    return path.join(options.logDir, loggerOptions.fileName ?? `${loggerOptions.file}.log`);
  }

  getSnapshot(): LauncherLogSnapshotPayload {
    const options = this.requireOptions();
    const sessions = this.discoverLogSessions(options);
    const entries = sessions.flatMap((session) =>
      this.readLogEntries(session.category, session.logDirectoryPath, session.id, session.logFileName, session),
    );

    entries.sort((left, right) => left.timestamp.localeCompare(right.timestamp));

    return {
      entries,
      sessions: sessions.map(({ category, ...session }) => ({
        ...session,
        count: entries.filter((entry) => entry.sessionId === session.id).length,
      })),
      sources: create_source_payloads(entries),
    };
  }

  onEntry(listener: LogEntryListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private write(
    loggerOptions: LoggerOptions,
    level: LogLevel,
    consoleMethod: keyof Pick<Console, "debug" | "info" | "log" | "warn" | "error"> | undefined,
    args: unknown[],
  ): void {
    if (!this.shouldWrite(level)) {
      return;
    }

    const entry = this.createEntry(loggerOptions, level, args);
    const line = this.formatEntryLine(entry);
    this.writeToFile(loggerOptions, line);
    this.notifyEntry(entry);

    if (consoleMethod) {
      this.writeToConsole(consoleMethod, args);
    }
  }

  private shouldWrite(level: LogLevel): boolean {
    const options = this.options;

    if (!options) {
      return true;
    }

    return LOG_LEVEL_WEIGHT[level] >= LOG_LEVEL_WEIGHT[options.minLevel];
  }

  private writeToFile(loggerOptions: LoggerOptions, line: string): void {
    if (!this.options) {
      return;
    }

    const logFilePath = this.getLoggerLogFilePath(loggerOptions);

    try {
      this.rotateIfNeeded(logFilePath);
      writeFileSync(logFilePath, `${line}\n`, { flag: "a" });
    } catch (error) {
      this.originalConsole?.error("Failed to write log file:", error);
    }
  }

  private createEntry(
    loggerOptions: LoggerOptions,
    level: LogLevel,
    args: unknown[],
  ): LauncherLogEntryPayload {
    const options = this.requireOptions();
    const timestamp = new Date().toISOString();
    const message = args.map((arg) => this.formatValue(arg)).join(" ");
    const sessionId = loggerOptions.sessionId ?? options.sessionName;

    return {
      id: `${sessionId}:${loggerOptions.file}:${Date.now()}:${this.entrySequence++}`,
      sessionId,
      timestamp,
      level: level === "off" ? "debug" : level,
      category: loggerOptions.file,
      source: loggerOptions.source,
      message,
      bottleId: loggerOptions.bottleId,
      bottleName: loggerOptions.bottleName,
    };
  }

  private formatEntryLine(entry: LauncherLogEntryPayload): string {
    return `${entry.timestamp} [${entry.level.toUpperCase()}] [${entry.source}] ${entry.message}`;
  }

  private notifyEntry(entry: LauncherLogEntryPayload): void {
    for (const listener of this.listeners) {
      listener(entry);
    }
  }

  private discoverLogSessions(
    options: Required<LogManagerOptions>,
  ): DiscoveredLogSession[] {
    const logRootDir = path.dirname(options.logDir);
    const sessionDirs = new Set<string>([options.logDir]);

    try {
      mkdirSync(logRootDir, { recursive: true });

      for (const entry of readdirSync(logRootDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
          continue;
        }

        const sessionDir = path.join(logRootDir, entry.name);
        const hasLogFile = get_log_file_names(sessionDir).length > 0;

        if (hasLogFile) {
          sessionDirs.add(sessionDir);
        }
      }
    } catch {
      sessionDirs.add(options.logDir);
    }

    return [...sessionDirs]
      .flatMap((sessionDir) => {
        const sessionId = path.basename(sessionDir);
        const logFileNames = get_log_file_names(sessionDir);
        const sessions: DiscoveredLogSession[] = [];

        if (logFileNames.includes("app.log")) {
          sessions.push({
            id: sessionId,
            label: sessionId,
            startedAt: session_started_at(sessionId),
            logFileName: "app.log",
            logFilePath: path.join(sessionDir, "app.log"),
            logDirectoryPath: sessionDir,
            kind: "app" as const,
            category: "app",
            count: 0,
            isRunning: sessionDir === options.logDir,
          });
        }

        for (const logFileName of logFileNames.filter((fileName) => fileName === "wine.log" || /^wine-.+\.log$/i.test(fileName))) {
          const metadata = wine_log_session_metadata(logFileName);

          sessions.push({
            id: `${sessionId}:${logFileName.replace(/\.log$/i, "")}`,
            label: metadata.label,
            startedAt: session_started_at(sessionId),
            logFileName,
            logFilePath: path.join(sessionDir, logFileName),
            logDirectoryPath: sessionDir,
            kind: "bottle" as const,
            category: "wine",
            bottleName: metadata.bottleName,
            count: 0,
            isRunning: sessionDir === options.logDir,
          });
        }

        return sessions;
      })
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }

  private readLogEntries(
    category: LogFileCategory,
    sessionDir: string,
    sessionId: string,
    logFileName: string,
    session: Pick<LauncherLogSnapshotPayload["sessions"][number], "bottleId" | "bottleName">,
  ): LauncherLogEntryPayload[] {
    const logFilePath = path.join(sessionDir, logFileName);

    if (!existsSync(logFilePath)) {
      return [];
    }

    try {
      const entries: LauncherLogEntryPayload[] = [];
      const lines = readFileSync(logFilePath, "utf8").split(/\r?\n/);

      lines.forEach((line, index) => {
        if (!line.trim()) {
          return;
        }

        const entry = this.parseLogLine(category, line, index, sessionId, session);

        if (entry) {
          entries.push(entry);
          return;
        }

        if (entries.length > 0) {
          this.appendContinuationLine(entries, line);
          return;
        }

        entries.push(this.createPlainLogEntry(category, line, index, sessionId, session));
      });

      return entries;
    } catch {
      return [];
    }
  }

  private parseLogLine(
    category: LogFileCategory,
    line: string,
    index: number,
    sessionId: string,
    session: Pick<LauncherLogSnapshotPayload["sessions"][number], "bottleId" | "bottleName">,
  ): LauncherLogEntryPayload | null {
    const match = line.match(/^(\S+)\s+\[(DEBUG|INFO|WARN|ERROR)\]\s+\[([^\]]+)\]\s*(.*)$/);

    if (!match) {
      return null;
    }

    return {
      id: `${sessionId}:${category}:snapshot:${index}`,
      sessionId,
      timestamp: match[1],
      level: match[2].toLowerCase() as LauncherLogEntryPayload["level"],
      category,
      source: match[3],
      message: match[4],
      bottleId: session.bottleId,
      bottleName: session.bottleName,
    };
  }

  private appendContinuationLine(entries: LauncherLogEntryPayload[], line: string): void {
    const lastEntry = entries[entries.length - 1];

    entries[entries.length - 1] = {
      ...lastEntry,
      message: `${lastEntry.message}\n${line.trimEnd()}`,
    };
  }

  private createPlainLogEntry(
    category: LogFileCategory,
    line: string,
    index: number,
    sessionId: string,
    session: Pick<LauncherLogSnapshotPayload["sessions"][number], "bottleId" | "bottleName">,
  ): LauncherLogEntryPayload {
    return {
      id: `${sessionId}:${category}:snapshot:plain:${index}`,
      sessionId,
      timestamp: session_started_at(sessionId),
      level: category === "wine" ? "debug" : "info",
      category,
      source: category,
      message: line.trimEnd(),
      bottleId: session.bottleId,
      bottleName: session.bottleName,
    };
  }

  private formatValue(value: unknown): string {
    if (value instanceof Error) {
      return value.stack ?? value.message;
    }

    if (typeof value === "string") {
      return value;
    }

    return util.inspect(value, {
      depth: 5,
      breakLength: 120,
      colors: false,
      compact: true,
    });
  }

  private patchConsole(): void {
    this.originalConsole = {
      debug: console.debug.bind(console),
      info: console.info.bind(console),
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };

    console.debug = (...args: unknown[]) => this.write(normalize_logger_options("console"), "debug", "debug", args);
    console.info = (...args: unknown[]) => this.write(normalize_logger_options("console"), "info", "info", args);
    console.log = (...args: unknown[]) => this.write(normalize_logger_options("console"), "info", "log", args);
    console.warn = (...args: unknown[]) => this.write(normalize_logger_options("console"), "warn", "warn", args);
    console.error = (...args: unknown[]) => this.write(normalize_logger_options("console"), "error", "error", args);
  }

  private writeToConsole(
    method: keyof Pick<Console, "debug" | "info" | "log" | "warn" | "error">,
    args: unknown[],
  ): void {
    const target = this.originalConsole ?? console;
    target[method](...args);
  }

  private rotateIfNeeded(logFilePath: string): void {
    const options = this.requireOptions();

    if (!existsSync(logFilePath) || statSync(logFilePath).size < options.maxFileBytes) {
      return;
    }

    for (let index = options.maxBackupFiles - 1; index >= 1; index -= 1) {
      const currentPath = `${logFilePath}.${index}`;
      const nextPath = `${logFilePath}.${index + 1}`;

      if (existsSync(currentPath)) {
        renameSync(currentPath, nextPath);
      }
    }

    renameSync(logFilePath, `${logFilePath}.1`);
  }

  private resolveDefaultLogDir(): string {
    return get_default_log_dir();
  }

  private requireOptions(): Required<LogManagerOptions> {
    if (!this.options) {
      const sessionName = create_log_session_name();

      this.options = {
        ...DEFAULT_OPTIONS,
        logDir: path.join(this.resolveDefaultLogDir(), sessionName),
        sessionName,
      };
      mkdirSync(this.options.logDir, { recursive: true });
    }

    return this.options;
  }
}

function normalize_logger_options(scopeOrOptions: string | LoggerOptions): LoggerOptions {
  if (typeof scopeOrOptions === "string") {
    return {
      file: "app",
      source: scopeOrOptions,
    };
  }

  return scopeOrOptions;
}

function get_log_file_names(sessionDir: string): string[] {
  try {
    return readdirSync(sessionDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((fileName) => fileName === "app.log" || fileName === "wine.log" || /^wine-.+\.log$/i.test(fileName))
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function wine_log_session_metadata(logFileName: string): {
  label: string;
  bottleName?: string;
} {
  if (logFileName === "wine.log") {
    return {
      label: "Wine",
      bottleName: "Wine",
    };
  }

  const rawName = logFileName.replace(/^wine-/i, "").replace(/\.log$/i, "");
  const [bottlePart, appPart] = rawName.split("__");
  const bottleName = humanize_log_file_part(bottlePart);
  const appName = appPart ? humanize_log_file_part(appPart) : "";

  return {
    label: appName ? `${bottleName} / ${appName}` : bottleName,
    bottleName,
  };
}

function humanize_log_file_part(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function create_log_session_name(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + "_" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function create_source_payloads(entries: LauncherLogEntryPayload[]): LauncherLogSourcePayload[] {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    counts.set(entry.source, (counts.get(entry.source) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([source, count]) => ({
      id: source,
      label: source,
      count,
    }));
}

function session_started_at(sessionName: string): string {
  const match = sessionName.match(/^(\d{4})-?(\d{2})-?(\d{2})-?_(\d{2})(\d{2})(\d{2})$/);

  if (!match) {
    return new Date().toISOString();
  }

  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  ).toISOString();
}

export const logManager = new LogManager();
