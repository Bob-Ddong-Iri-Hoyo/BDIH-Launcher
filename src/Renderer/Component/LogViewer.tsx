import React, { useMemo, useState } from "react";
import { CalendarDays, FileText, Search } from "lucide-react";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogLevelFilter = "all" | LogLevel;
export type LogFileCategory = "app" | "bottle" | "wine";
export type LogCategoryFilter = "all" | LogFileCategory;
export type LogSourceFilter = "all" | string;
export type LogSessionKind = "app" | "bottle";
type LogTargetKind = "app" | "bottle";

export interface LogTarget {
  id: string;
  label: string;
  kind: LogTargetKind;
  bottleId?: string;
  count: number;
}

export interface LogEntry {
  id: string;
  sessionId?: string;
  timestamp: string;
  level: LogLevel;
  category?: LogFileCategory;
  source: string;
  bottleId?: string;
  bottleName?: string;
  message: string;
  detail?: string;
}

export interface LogSession {
  id: string;
  label: string;
  startedAt: string;
  logFileName?: string;
  kind?: LogSessionKind;
  bottleId?: string;
  bottleName?: string;
  count?: number;
  isRunning?: boolean;
}

export interface LogSourceOption {
  id: string;
  label: string;
  count?: number;
}

export interface LogViewerProps {
  entries: LogEntry[];
  sessions: LogSession[];
  sources: LogSourceOption[];
  selectedSessionId?: string;
  selectedCategory?: LogCategoryFilter;
  selectedSourceId?: LogSourceFilter;
  selectedLevel?: LogLevelFilter;
  searchValue?: string;
  onSessionChange?: (sessionId: string) => void;
  onSourceChange?: (sourceId: LogSourceFilter) => void;
  onLevelChange?: (level: LogLevelFilter) => void;
  onSearchChange?: (value: string) => void;
  className?: string;
}

const LEVEL_LABEL: Record<LogLevelFilter, string> = {
  all: "All",
  debug: "Debug",
  info: "Info",
  warn: "Warn",
  error: "Error",
};

export function LogViewer({
  entries,
  sessions,
  sources,
  selectedSessionId,
  selectedCategory,
  selectedSourceId,
  selectedLevel,
  searchValue,
  onSessionChange,
  onSourceChange,
  onLevelChange,
  onSearchChange,
  className = "",
}: LogViewerProps) {
  const sortedSessions = useMemo(() => sort_sessions_by_latest(sessions), [sessions]);
  const targets = useMemo(() => build_log_targets(sortedSessions), [sortedSessions]);
  const [internalTargetId, setInternalTargetId] = useState(get_default_target_id(targets));
  const targetSessions = useMemo(
    () => filter_sessions_by_target(sortedSessions, internalTargetId),
    [internalTargetId, sortedSessions],
  );
  const [internalSessionId, setInternalSessionId] = useState(targetSessions[0]?.id ?? "");
  const [internalSourceId, setInternalSourceId] = useState<LogSourceFilter>("all");
  const [internalLevel, setInternalLevel] = useState<LogLevelFilter>("all");
  const [internalSearch, setInternalSearch] = useState("");

  const activeTargetId = internalTargetId || get_default_target_id(targets);
  const activeSessionId = selectedSessionId ?? internalSessionId;
  const activeCategory = selectedCategory ?? "all";
  const activeSourceId = selectedSourceId ?? internalSourceId;
  const activeLevel = selectedLevel ?? internalLevel;
  const activeSearch = searchValue ?? internalSearch;

  React.useEffect(() => {
    if (targets.length === 0) {
      return;
    }

    const targetStillExists = targets.some((target) => target.id === activeTargetId);

    if (!activeTargetId || !targetStillExists) {
      setInternalTargetId(get_default_target_id(targets));
    }
  }, [activeTargetId, targets]);

  React.useEffect(() => {
    if (targetSessions.length === 0) {
      if (!selectedSessionId) {
        setInternalSessionId("");
      }
      return;
    }

    const selectedStillExists = targetSessions.some((session) => session.id === activeSessionId);

    if (!activeSessionId || !selectedStillExists) {
      handleSessionChange(targetSessions[0].id);
    }
  }, [activeSessionId, selectedSessionId, targetSessions]);

  const sessionScopedEntries = useMemo(() => {
    const entriesHaveSessionIds = entries.some((entry) => entry.sessionId);

    if (!entriesHaveSessionIds || !activeSessionId) {
      return entries;
    }

    return entries.filter((entry) => entry.sessionId === activeSessionId);
  }, [activeSessionId, entries]);

  const filteredEntries = useMemo(() => {
    const normalizedSearch = activeSearch.trim().toLowerCase();

    return sessionScopedEntries.filter((entry) => {
      const matchesCategory = activeCategory === "all" || entry.category === activeCategory;
      const matchesSource = activeSourceId === "all" || entry.source === activeSourceId;
      const matchesLevel = activeLevel === "all" || entry.level === activeLevel;
      const matchesSearch =
        normalizedSearch.length === 0 ||
        entry.message.toLowerCase().includes(normalizedSearch) ||
        entry.source.toLowerCase().includes(normalizedSearch) ||
        entry.bottleName?.toLowerCase().includes(normalizedSearch) ||
        entry.detail?.toLowerCase().includes(normalizedSearch);

      return matchesCategory && matchesSource && matchesLevel && matchesSearch;
    });
  }, [activeCategory, activeLevel, activeSearch, activeSourceId, sessionScopedEntries]);

  const logText = useMemo(() => filteredEntries.map(formatLogLine).join("\n"), [filteredEntries]);

  function handleSessionChange(sessionId: string) {
    setInternalSessionId(sessionId);
    onSessionChange?.(sessionId);
  }

  function handleTargetChange(targetId: string) {
    setInternalTargetId(targetId);
    const nextSession = filter_sessions_by_target(sortedSessions, targetId)[0];

    if (nextSession) {
      handleSessionChange(nextSession.id);
    }
  }

  function handleSourceChange(sourceId: LogSourceFilter) {
    setInternalSourceId(sourceId);
    onSourceChange?.(sourceId);
  }

  function handleLevelChange(level: LogLevelFilter) {
    setInternalLevel(level);
    onLevelChange?.(level);
  }

  function handleSearchChange(value: string) {
    setInternalSearch(value);
    onSearchChange?.(value);
  }

  return (
    <section
      className={`flex min-h-0 w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0f172a] text-slate-100 shadow-2xl shadow-black/20 ${className}`}
    >
      <LogTargetBar
        targets={targets}
        selectedTargetId={activeTargetId}
        onTargetChange={handleTargetChange}
      />
      <div className="grid min-h-0 flex-1 grid-cols-[18rem_minmax(0,1fr)]">
        <LogListPane
          sessions={targetSessions}
          selectedSessionId={activeSessionId}
          onSessionChange={handleSessionChange}
        />
        <div className="flex min-h-0 min-w-0 flex-col">
          <LogFilterBar
            sources={sources}
            selectedSourceId={activeSourceId}
            selectedLevel={activeLevel}
            searchValue={activeSearch}
            visibleCount={filteredEntries.length}
            totalCount={sessionScopedEntries.length}
            onSourceChange={handleSourceChange}
            onLevelChange={handleLevelChange}
            onSearchChange={handleSearchChange}
          />
          <LogTextPanel text={logText} />
        </div>
      </div>
    </section>
  );
}

export interface LogListPaneProps {
  sessions: LogSession[];
  selectedSessionId: string;
  onSessionChange: (sessionId: string) => void;
}

function LogListPane({
  sessions,
  selectedSessionId,
  onSessionChange,
}: LogListPaneProps) {
  return (
    <aside className="flex min-h-0 flex-col border-r border-white/10 bg-[#0b1020]">
      <LogSessionList
        sessions={sessions}
        selectedSessionId={selectedSessionId}
        onSessionChange={onSessionChange}
      />
    </aside>
  );
}

export interface LogTargetBarProps {
  targets: LogTarget[];
  selectedTargetId: string;
  onTargetChange: (targetId: string) => void;
}

function LogTargetBar({
  targets,
  selectedTargetId,
  onTargetChange,
}: LogTargetBarProps) {
  return (
    <div className="border-b border-white/10 bg-[#0b1020] px-3 py-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
        <FileText className="h-4 w-4 text-slate-400" />
        Log target
      </div>
      <div className="flex min-w-0 gap-2 overflow-x-auto">
        {targets.map((target) => {
          const selected = target.id === selectedTargetId;

          return (
            <button
              key={target.id}
              type="button"
              onClick={() => onTargetChange(target.id)}
              className={`flex h-10 min-w-40 items-center justify-between gap-3 rounded-md border px-3 text-left transition ${
                selected
                  ? "accent-selection text-white"
                  : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:bg-white/[0.06] hover:text-slate-200"
              }`}
            >
              <span className="min-w-0 truncate text-sm font-medium">{target.label}</span>
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-slate-300">{target.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface LogSessionListProps {
  sessions: LogSession[];
  selectedSessionId: string;
  onSessionChange: (sessionId: string) => void;
}

export function LogSessionList({
  sessions,
  selectedSessionId,
  onSessionChange,
}: LogSessionListProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
        <CalendarDays className="h-4 w-4 text-slate-400" />
        History
      </div>
      <div className="space-y-1">
        {sessions.map((session) => {
          const selected = session.id === selectedSessionId;

          return (
            <button
              key={session.id}
              type="button"
              onClick={() => onSessionChange(session.id)}
              title={formatSessionMetaLabel(session)}
              className={`grid min-h-14 w-full content-center rounded-md border px-3 py-2 text-left transition ${
                selected
                  ? "accent-selection text-white"
                  : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:bg-white/[0.06] hover:text-slate-200"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                {session.isRunning && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
                <span className="truncate">{session.label}</span>
              </span>
              <span className="mt-1 flex items-center justify-between gap-3 text-xs text-slate-500">
                <span className="truncate">{formatLogFileName(session)}</span>
                {session.count !== undefined && <span>{session.count} lines</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface LogFilterBarProps {
  sources: LogSourceOption[];
  selectedSourceId: LogSourceFilter;
  selectedLevel: LogLevelFilter;
  searchValue: string;
  visibleCount: number;
  totalCount: number;
  onSourceChange: (sourceId: LogSourceFilter) => void;
  onLevelChange: (level: LogLevelFilter) => void;
  onSearchChange: (value: string) => void;
}

export function LogFilterBar({
  sources,
  selectedSourceId,
  selectedLevel,
  searchValue,
  visibleCount,
  totalCount,
  onSourceChange,
  onLevelChange,
  onSearchChange,
}: LogFilterBarProps) {
  const levels: LogLevelFilter[] = ["all", "debug", "info", "warn", "error"];

  return (
    <header className="border-b border-white/10 bg-[#111827] px-3 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Filter text"
            className="h-9 w-full rounded-md border border-white/10 bg-[#0b1020] pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[rgb(var(--accent-rgb))] focus:ring-2 focus:ring-[rgb(var(--accent-rgb)/0.22)]"
          />
        </div>
        <select
          value={selectedSourceId}
          onChange={(event) => onSourceChange(event.target.value)}
          className="h-9 w-36 rounded-md border border-white/10 bg-[#0b1020] px-2 text-sm text-slate-200 outline-none focus:border-[rgb(var(--accent-rgb))] focus:ring-2 focus:ring-[rgb(var(--accent-rgb)/0.22)]"
        >
          <option value="all">All sources</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.label}
            </option>
          ))}
        </select>
        <div className="flex h-9 shrink-0 rounded-md border border-white/10 bg-[#0b1020] p-1">
          {levels.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => onLevelChange(level)}
              className={`h-7 rounded px-2.5 text-xs font-medium transition ${
                selectedLevel === level
                  ? "accent-primary"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
              }`}
            >
              {LEVEL_LABEL[level]}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 text-xs text-slate-500">
        Showing {visibleCount} of {totalCount}
      </div>
    </header>
  );
}

export interface LogTextPanelProps {
  text: string;
}

export function LogTextPanel({ text }: LogTextPanelProps) {
  return (
    <div className="min-h-0 flex-1 bg-[#0b1020] p-3">
      <textarea
        readOnly
        spellCheck={false}
        value={text || "No logs match the current filters."}
        className="h-full w-full resize-none rounded-md border border-white/10 bg-[#070b16] p-3 font-mono text-xs leading-5 text-slate-200 outline-none selection:bg-[rgb(var(--accent-rgb)/0.32)] selection:text-white"
      />
    </div>
  );
}

function formatLogLine(entry: LogEntry): string {
  const category = entry.category ? `${entry.category}:` : "";
  const bottle = entry.bottleName ? ` [${entry.bottleName}]` : "";
  const base = `${formatLogTime(entry.timestamp)} [${entry.level.toUpperCase()}] [${category}${entry.source}]${bottle} ${entry.message}`;

  if (!entry.detail) {
    return base;
  }

  return `${base}\n${entry.detail}`;
}

function sort_sessions_by_latest(sessions: LogSession[]) {
  return [...sessions].sort((left, right) => {
    const leftTime = new Date(left.startedAt).getTime();
    const rightTime = new Date(right.startedAt).getTime();

    return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
  });
}

function build_log_targets(sessions: LogSession[]): LogTarget[] {
  const appSessions = sessions.filter((session) => session.kind !== "bottle");
  const targets: LogTarget[] = [];

  if (appSessions.length > 0) {
    targets.push({
      id: "app",
      label: "App Logs",
      kind: "app",
      count: appSessions.length,
    });
  }

  const bottleTargets = new Map<string, LogTarget>();

  sessions.forEach((session) => {
    if (session.kind !== "bottle") {
      return;
    }

    const bottleId = session.bottleId ?? session.bottleName ?? "unknown-bottle";
    const existingTarget = bottleTargets.get(bottleId);

    if (existingTarget) {
      existingTarget.count += 1;
      return;
    }

    bottleTargets.set(bottleId, {
      id: `bottle:${bottleId}`,
      label: session.bottleName ?? session.label,
      kind: "bottle",
      bottleId,
      count: 1,
    });
  });

  return [...targets, ...bottleTargets.values()];
}

function get_default_target_id(targets: LogTarget[]) {
  return targets.find((target) => target.kind === "app")?.id ?? targets[0]?.id ?? "";
}

function filter_sessions_by_target(sessions: LogSession[], targetId: string) {
  if (targetId === "app") {
    return sessions.filter((session) => session.kind !== "bottle");
  }

  if (targetId.startsWith("bottle:")) {
    const bottleId = targetId.slice("bottle:".length);
    return sessions.filter((session) => session.kind === "bottle" && (session.bottleId ?? session.bottleName ?? "unknown-bottle") === bottleId);
  }

  return sessions;
}

function formatLogTime(timestamp: string): string {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatSessionTime(timestamp: string): string {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSessionMetaLabel(session: LogSession): string {
  const time = formatSessionTime(session.startedAt);

  if (session.bottleName) {
    return `${time} - ${session.bottleName}`;
  }

  if (session.kind === "app") {
    return `${time} - App`;
  }

  return time;
}

function formatLogFileName(session: LogSession): string {
  if (session.logFileName) {
    return session.logFileName;
  }

  const date = new Date(session.startedAt);
  const datePart = Number.isNaN(date.getTime())
    ? session.startedAt
    : [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-");
  const owner = session.kind === "bottle" ? session.bottleName ?? session.label : "App";

  return `${owner}-${datePart}.log`;
}
