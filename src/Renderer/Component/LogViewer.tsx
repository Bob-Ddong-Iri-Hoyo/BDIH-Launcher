import React, { useMemo, useState } from "react";
import {
  CalendarDays,
  FileText,
  Pin,
  Search,
  ScrollText,
} from "lucide-react";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogLevelFilter = "all" | LogLevel;
export type LogFileCategory = "app" | "bottle" | "wine";
export type LogCategoryFilter = "all" | LogFileCategory;
export type LogSourceFilter = "all" | string;
export type LogSessionKind = "app" | "bottle";
export type LogTargetDisplayMode = "picker" | "label";
type LogTargetKind = "app" | "bottle";

export interface LogTarget {
  id: string;
  label: string;
  kind: LogTargetKind;
  bottleId?: string;
  count: number;
  runningCount: number;
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
  selectedTargetId?: string;
  selectedSessionId?: string;
  selectedCategory?: LogCategoryFilter;
  selectedSourceId?: LogSourceFilter;
  selectedLevel?: LogLevelFilter;
  searchValue?: string;
  favoriteTargetIds?: string[];
  targetDisplayMode?: LogTargetDisplayMode;
  targetLabel?: string;
  onTargetChange?: (targetId: string) => void;
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

const LEVELS: LogLevelFilter[] = ["all", "debug", "info", "warn", "error"];

export function LogViewer({
  entries,
  sessions,
  sources,
  selectedTargetId,
  selectedSessionId,
  selectedCategory = "all",
  selectedSourceId,
  selectedLevel,
  searchValue,
  favoriteTargetIds = [],
  targetDisplayMode = "picker",
  targetLabel,
  onTargetChange,
  onSessionChange,
  onSourceChange,
  onLevelChange,
  onSearchChange,
  className = "",
}: LogViewerProps) {
  const sortedSessions = useMemo(() => sort_sessions(sessions), [sessions]);
  const targets = useMemo(
    () => create_log_targets(sortedSessions),
    [sortedSessions],
  );
  const [localTargetId, setLocalTargetId] = useState("");
  const [localSessionId, setLocalSessionId] = useState("");
  const [localSourceId, setLocalSourceId] = useState<LogSourceFilter>("all");
  const [localLevel, setLocalLevel] = useState<LogLevelFilter>("all");
  const [localSearch, setLocalSearch] = useState("");

  const targetId = resolve_target_id(
    targets,
    selectedTargetId ?? localTargetId,
  );
  const target = targets.find((candidate) => candidate.id === targetId);
  const targetSessions = useMemo(
    () => sessions_for_target(sortedSessions, targetId),
    [sortedSessions, targetId],
  );
  const sessionId = resolve_session_id(
    targetSessions,
    selectedSessionId ?? localSessionId,
  );
  const session = targetSessions.find(
    (candidate) => candidate.id === sessionId,
  );
  const sessionEntries = useMemo(
    () => entries_for_session(entries, sessionId, target),
    [entries, sessionId, target],
  );
  const sourceOptions = useMemo(
    () => create_source_options(sources, sessionEntries),
    [sessionEntries, sources],
  );
  const sourceId = resolve_source_id(
    sourceOptions,
    selectedSourceId ?? localSourceId,
  );
  const level = selectedLevel ?? localLevel;
  const search = searchValue ?? localSearch;
  const filteredEntries = useMemo(
    () =>
      filter_entries(sessionEntries, {
        category: selectedCategory,
        level,
        search,
        sourceId,
      }),
    [level, search, selectedCategory, sessionEntries, sourceId],
  );
  const logText = useMemo(
    () => filteredEntries.map(format_log_line).join("\n"),
    [filteredEntries],
  );

  function change_target(nextTargetId: string) {
    const nextSessions = sessions_for_target(sortedSessions, nextTargetId);
    const nextSessionId = nextSessions[0]?.id ?? "";

    if (selectedTargetId === undefined) {
      setLocalTargetId(nextTargetId);
    }

    if (selectedSessionId === undefined) {
      setLocalSessionId(nextSessionId);
    }

    if (selectedSourceId === undefined) {
      setLocalSourceId("all");
    }

    onTargetChange?.(nextTargetId);

    if (nextSessionId) {
      onSessionChange?.(nextSessionId);
    }
  }

  function change_session(nextSessionId: string) {
    if (selectedSessionId === undefined) {
      setLocalSessionId(nextSessionId);
    }

    if (selectedSourceId === undefined) {
      setLocalSourceId("all");
    }

    onSessionChange?.(nextSessionId);
  }

  function change_source(nextSourceId: LogSourceFilter) {
    setLocalSourceId(nextSourceId);
    onSourceChange?.(nextSourceId);
  }

  function change_level(nextLevel: LogLevelFilter) {
    setLocalLevel(nextLevel);
    onLevelChange?.(nextLevel);
  }

  function change_search(nextSearch: string) {
    setLocalSearch(nextSearch);
    onSearchChange?.(nextSearch);
  }

  return (
    <section
      className={`flex min-h-0 w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0b1020] text-slate-100 shadow-2xl shadow-black/20 ${className}`}
    >
      <LogTargetHeader
        targets={targets}
        favoriteTargetIds={favoriteTargetIds}
        selectedTarget={target}
        selectedTargetId={targetId}
        displayMode={targetDisplayMode}
        label={targetLabel}
        onTargetChange={change_target}
      />
      <div className="grid min-h-0 flex-1 grid-cols-[18rem_minmax(0,1fr)]">
        <LogHistoryPane
          sessions={targetSessions}
          selectedSessionId={sessionId}
          onSessionChange={change_session}
        />
        <LogContent
          entries={filteredEntries}
          logText={logText}
          selectedSession={session}
          sources={sourceOptions}
          selectedSourceId={sourceId}
          selectedLevel={level}
          searchValue={search}
          visibleCount={filteredEntries.length}
          totalCount={sessionEntries.length}
          onSourceChange={change_source}
          onLevelChange={change_level}
          onSearchChange={change_search}
        />
      </div>
    </section>
  );
}

function LogTargetHeader({
  targets,
  favoriteTargetIds,
  selectedTarget,
  selectedTargetId,
  displayMode,
  label,
  onTargetChange,
}: {
  targets: LogTarget[];
  favoriteTargetIds: string[];
  selectedTarget?: LogTarget;
  selectedTargetId: string;
  displayMode: LogTargetDisplayMode;
  label?: string;
  onTargetChange: (targetId: string) => void;
}) {
  const favoriteTargets = favoriteTargetIds
    .map((targetId) => targets.find((target) => target.id === targetId))
    .filter((target): target is LogTarget => Boolean(target));

  if (displayMode === "label") {
    return (
      <header className="border-b border-white/10 bg-[#101827] px-4 py-3">
        <div className="flex min-w-0 items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <FileText className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="truncate">
                {label ?? selectedTarget?.label ?? "Logs"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {selectedTarget?.kind === "bottle"
                ? "Bottle logs"
                : "Application logs"}
            </p>
          </div>
          {selectedTarget && <CountPill value={selectedTarget.count} />}
        </div>
      </header>
    );
  }

  return (
    <header className="border-b border-white/10 bg-[#101827] px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-200">
          <FileText className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate">Log targets</span>
        </div>
        <span className="rounded bg-white/[0.05] px-2 py-1 text-xs text-slate-500">
          {targets.length} targets
        </span>
      </div>

      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          favoriteTargets.length > 0 ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="mb-2 flex min-w-0 items-center gap-2">
            <Pin className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
              {favoriteTargets.map((target) => (
                <TargetChip
                  key={`favorite-${target.id}`}
                  target={target}
                  selected={target.id === selectedTargetId}
                  compact
                  onClick={() => onTargetChange(target.id)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 gap-2 overflow-x-auto">
        {targets.map((target) => (
          <TargetChip
            key={target.id}
            target={target}
            selected={target.id === selectedTargetId}
            onClick={() => onTargetChange(target.id)}
          />
        ))}
      </div>
    </header>
  );
}

function TargetChip({
  target,
  selected,
  compact = false,
  onClick,
}: {
  target: LogTarget;
  selected: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 text-left transition ${
        compact ? "h-9 min-w-36" : "h-11 min-w-44"
      } ${
        selected
          ? "accent-selection text-white"
          : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:bg-white/[0.06] hover:text-slate-200"
      }`}
    >
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          {target.runningCount > 0 && <LiveDot />}
          <span className="truncate">{target.label}</span>
        </span>
        {!compact && (
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {target.kind === "app" ? "Application logs" : "Bottle logs"}
          </span>
        )}
      </span>
      <CountPill value={target.count} />
    </button>
  );
}

function LogHistoryPane({
  sessions,
  selectedSessionId,
  onSessionChange,
}: {
  sessions: LogSession[];
  selectedSessionId: string;
  onSessionChange: (sessionId: string) => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col border-r border-white/10 bg-[#08101f] p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
        <CalendarDays className="h-4 w-4 text-slate-400" />
        <span>History</span>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {sessions.length === 0 && (
          <EmptyListMessage>No log sessions</EmptyListMessage>
        )}
        {sessions.map((session) => (
          <SessionButton
            key={session.id}
            session={session}
            selected={session.id === selectedSessionId}
            onClick={() => onSessionChange(session.id)}
          />
        ))}
      </div>
    </aside>
  );
}

function SessionButton({
  session,
  selected,
  onClick,
}: {
  session: LogSession;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={session_title(session)}
      className={`grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-2 text-left transition ${
        selected
          ? "accent-selection text-white"
          : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:bg-white/[0.06] hover:text-slate-200"
      }`}
    >
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          {session.isRunning && <LiveDot />}
          <span className="truncate">{session.label}</span>
        </span>
        <span className="mt-1 block truncate text-xs text-slate-500">
          {log_file_name(session)}
        </span>
        <span className="mt-1 block truncate text-[11px] text-slate-500">
          {format_session_time(session.startedAt)}
        </span>
      </span>
      {session.count !== undefined && (
        <CountPill value={session.count} suffix="lines" />
      )}
    </button>
  );
}

function LogContent({
  entries,
  logText,
  selectedSession,
  sources,
  selectedSourceId,
  selectedLevel,
  searchValue,
  visibleCount,
  totalCount,
  onSourceChange,
  onLevelChange,
  onSearchChange,
}: {
  entries: LogEntry[];
  logText: string;
  selectedSession?: LogSession;
  sources: LogSourceOption[];
  selectedSourceId: LogSourceFilter;
  selectedLevel: LogLevelFilter;
  searchValue: string;
  visibleCount: number;
  totalCount: number;
  onSourceChange: (sourceId: LogSourceFilter) => void;
  onLevelChange: (level: LogLevelFilter) => void;
  onSearchChange: (value: string) => void;
}) {
  return (
    <main className="flex min-h-0 min-w-0 flex-col bg-[#0b1020]">
      <LogToolbar
        selectedSession={selectedSession}
        sources={sources}
        selectedSourceId={selectedSourceId}
        selectedLevel={selectedLevel}
        searchValue={searchValue}
        visibleCount={visibleCount}
        totalCount={totalCount}
        onSourceChange={onSourceChange}
        onLevelChange={onLevelChange}
        onSearchChange={onSearchChange}
      />
      <LogTextPanel
        entries={entries}
        text={logText}
        placeholder={
          selectedSession
            ? "No logs match the current filters."
            : "No log session selected."
        }
      />
    </main>
  );
}

function LogToolbar({
  selectedSession,
  sources,
  selectedSourceId,
  selectedLevel,
  searchValue,
  visibleCount,
  totalCount,
  onSourceChange,
  onLevelChange,
  onSearchChange,
}: {
  selectedSession?: LogSession;
  sources: LogSourceOption[];
  selectedSourceId: LogSourceFilter;
  selectedLevel: LogLevelFilter;
  searchValue: string;
  visibleCount: number;
  totalCount: number;
  onSourceChange: (sourceId: LogSourceFilter) => void;
  onLevelChange: (level: LogLevelFilter) => void;
  onSearchChange: (value: string) => void;
}) {
  return (
    <header className="border-b border-white/10 bg-[#101827] p-3">
      <div className="mb-3 flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-100">
            <ScrollText className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate">
              {selectedSession?.label ?? "No session selected"}
            </span>
          </div>
          <div className="mt-1 truncate text-xs text-slate-500">
            {selectedSession
              ? log_file_name(selectedSession)
              : "Select a target and history item"}
          </div>
        </div>
        <span className="shrink-0 rounded-md bg-white/[0.05] px-2 py-1 text-xs text-slate-400">
          {visibleCount} / {totalCount}
        </span>
      </div>
      <div className="grid min-w-0 grid-cols-[minmax(14rem,1fr)_10rem_auto] gap-2">
        <label className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Filter text"
            className="h-9 w-full rounded-md border border-white/10 bg-[#0b1020] pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[rgb(var(--accent-rgb))] focus:ring-2 focus:ring-[rgb(var(--accent-rgb)/0.22)]"
          />
        </label>
        <select
          value={selectedSourceId}
          onChange={(event) => onSourceChange(event.target.value)}
          className="h-9 min-w-0 rounded-md border border-white/10 bg-[#0b1020] px-2 text-sm text-slate-200 outline-none focus:border-[rgb(var(--accent-rgb))] focus:ring-2 focus:ring-[rgb(var(--accent-rgb)/0.22)]"
        >
          <option value="all">All sources</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.label}
              {source.count !== undefined ? ` (${source.count})` : ""}
            </option>
          ))}
        </select>
        <div className="flex h-9 shrink-0 rounded-md border border-white/10 bg-[#0b1020] p-1">
          {LEVELS.map((level) => (
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
    </header>
  );
}

export interface LogTextPanelProps {
  text: string;
  entries?: LogEntry[];
  placeholder?: string;
}

export function LogTextPanel({
  text,
  entries = [],
  placeholder = "No logs match the current filters.",
}: LogTextPanelProps) {
  return (
    <div className="min-h-0 flex-1 bg-[#0b1020] p-3">
      <pre
        aria-label="Selected log content"
        className="h-full select-text overflow-auto rounded-md border border-white/10 bg-[#050914] p-3 font-mono text-xs leading-5 text-slate-200 selection:bg-[rgb(var(--accent-rgb)/0.32)] selection:text-white"
      >
        <code>{text || placeholder}</code>
      </pre>
      {entries.length === 0 && <span className="sr-only">{placeholder}</span>}
    </div>
  );
}

function EmptyListMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-white/10 px-3 py-4 text-sm text-slate-500">
      {children}
    </div>
  );
}

function LiveDot() {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
    </span>
  );
}

function CountPill({ value, suffix }: { value: number; suffix?: string }) {
  return (
    <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-slate-300">
      {suffix ? `${value} ${suffix}` : value}
    </span>
  );
}

function sort_sessions(sessions: LogSession[]) {
  return [...sessions].sort((left, right) => {
    if (Boolean(left.isRunning) !== Boolean(right.isRunning)) {
      return left.isRunning ? -1 : 1;
    }

    return to_time(right.startedAt) - to_time(left.startedAt);
  });
}

function create_log_targets(sessions: LogSession[]): LogTarget[] {
  const appSessions = sessions.filter((session) => session.kind !== "bottle");
  const bottleTargets = new Map<string, LogTarget>();

  sessions.forEach((session) => {
    if (session.kind !== "bottle") {
      return;
    }

    const bottleId = bottle_target_key(session);
    const current = bottleTargets.get(bottleId);

    if (current) {
      current.count += 1;
      current.runningCount += session.isRunning ? 1 : 0;
      return;
    }

    bottleTargets.set(bottleId, {
      id: `bottle:${bottleId}`,
      label: session.bottleName ?? session.label,
      kind: "bottle",
      bottleId,
      count: 1,
      runningCount: session.isRunning ? 1 : 0,
    });
  });

  return [
    {
      id: "app",
      label: "App Logs",
      kind: "app",
      count: appSessions.length,
      runningCount: appSessions.filter((session) => session.isRunning).length,
    },
    ...bottleTargets.values(),
  ];
}

function resolve_target_id(targets: LogTarget[], requestedTargetId: string) {
  if (targets.some((target) => target.id === requestedTargetId)) {
    return requestedTargetId;
  }

  return (
    targets.find((target) => target.kind === "app")?.id ??
    targets[0]?.id ??
    ""
  );
}

function resolve_session_id(sessions: LogSession[], requestedSessionId: string) {
  if (sessions.some((session) => session.id === requestedSessionId)) {
    return requestedSessionId;
  }

  return sessions[0]?.id ?? "";
}

function resolve_source_id(
  sources: LogSourceOption[],
  requestedSourceId: LogSourceFilter,
) {
  if (
    requestedSourceId === "all" ||
    sources.some((source) => source.id === requestedSourceId)
  ) {
    return requestedSourceId;
  }

  return "all";
}

function sessions_for_target(sessions: LogSession[], targetId: string) {
  if (targetId === "app") {
    return sessions.filter((session) => session.kind !== "bottle");
  }

  if (targetId.startsWith("bottle:")) {
    const bottleId = targetId.slice("bottle:".length);

    return sessions.filter(
      (session) =>
        session.kind === "bottle" && bottle_target_key(session) === bottleId,
    );
  }

  return [];
}

function entries_for_session(
  entries: LogEntry[],
  sessionId: string,
  target?: LogTarget,
) {
  if (entries.some((entry) => entry.sessionId)) {
    return sessionId
      ? entries.filter((entry) => entry.sessionId === sessionId)
      : [];
  }

  if (!target) {
    return [];
  }

  if (target.kind === "app") {
    return entries.filter((entry) => !entry.bottleId);
  }

  return entries.filter(
    (entry) =>
      entry.bottleId === target.bottleId || entry.bottleName === target.label,
  );
}

function create_source_options(
  sources: LogSourceOption[],
  entries: LogEntry[],
): LogSourceOption[] {
  const labels = new Map(sources.map((source) => [source.id, source.label]));
  const counts = new Map<string, number>();

  entries.forEach((entry) => {
    counts.set(entry.source, (counts.get(entry.source) ?? 0) + 1);
  });

  return [...counts.entries()]
    .map(([id, count]) => ({
      id,
      label: labels.get(id) ?? id,
      count,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function filter_entries(
  entries: LogEntry[],
  filters: {
    category: LogCategoryFilter;
    level: LogLevelFilter;
    search: string;
    sourceId: LogSourceFilter;
  },
) {
  const search = filters.search.trim().toLowerCase();

  return entries.filter((entry) => {
    const matchesCategory =
      filters.category === "all" || entry.category === filters.category;
    const matchesSource =
      filters.sourceId === "all" || entry.source === filters.sourceId;
    const matchesLevel =
      filters.level === "all" || entry.level === filters.level;
    const matchesSearch =
      search.length === 0 ||
      entry.message.toLowerCase().includes(search) ||
      entry.source.toLowerCase().includes(search) ||
      entry.bottleName?.toLowerCase().includes(search) ||
      entry.detail?.toLowerCase().includes(search);

    return matchesCategory && matchesSource && matchesLevel && matchesSearch;
  });
}

function format_log_line(entry: LogEntry): string {
  const category = entry.category ? `${entry.category}:` : "";
  const bottle = entry.bottleName ? ` [${entry.bottleName}]` : "";
  const line = `${format_log_time(entry.timestamp)} [${entry.level.toUpperCase()}] [${category}${entry.source}]${bottle} ${entry.message}`;

  return entry.detail ? `${line}\n${entry.detail}` : line;
}

function session_title(session: LogSession) {
  const owner = session.kind === "bottle" ? session.bottleName : "App";

  return [owner, format_session_time(session.startedAt), log_file_name(session)]
    .filter(Boolean)
    .join(" - ");
}

function log_file_name(session: LogSession) {
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
  const owner =
    session.kind === "bottle" ? session.bottleName ?? session.label : "App";

  return `${owner}-${datePart}.log`;
}

function bottle_target_key(session: LogSession) {
  return session.bottleId ?? session.bottleName ?? "unknown-bottle";
}

function format_log_time(timestamp: string) {
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

function format_session_time(timestamp: string) {
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
  });
}

function to_time(timestamp: string) {
  const time = new Date(timestamp).getTime();

  return Number.isNaN(time) ? 0 : time;
}
