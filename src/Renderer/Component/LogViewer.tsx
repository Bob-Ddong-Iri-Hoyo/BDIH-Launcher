import React, { useMemo, useState } from "react";
import {
  CalendarDays,
  ExternalLink,
  FileText,
  FolderOpen,
  Search,
  ScrollText,
} from "lucide-react";
import { SelectMenu, SelectMenuOption } from "./SelectMenu";

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
  logFilePath?: string;
  logDirectoryPath?: string;
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
  onFavoriteTargetIdsChange?: (targetIds: string[]) => void;
  onSessionChange?: (sessionId: string) => void;
  onSourceChange?: (sourceId: LogSourceFilter) => void;
  onLevelChange?: (level: LogLevelFilter) => void;
  onSearchChange?: (value: string) => void;
  onOpenLogFolder?: () => void;
  onOpenLogFile?: (session: LogSession) => void;
  onRevealLogFile?: (session: LogSession) => void;
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
const LOG_BOTTOM_STICKY_THRESHOLD = 32;

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
  favoriteTargetIds,
  targetDisplayMode = "picker",
  targetLabel,
  onTargetChange,
  onFavoriteTargetIdsChange,
  onSessionChange,
  onSourceChange,
  onLevelChange,
  onSearchChange,
  onOpenLogFolder,
  onOpenLogFile,
  onRevealLogFile,
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
  const [localFavoriteTargetIds, setLocalFavoriteTargetIds] = useState<string[]>(favoriteTargetIds ?? []);
  const [contextMenuState, setContextMenuState] = useState<{
    x: number;
    y: number;
    session: LogSession;
  } | null>(null);

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

  const activeFavoriteTargetIds =
    favoriteTargetIds !== undefined && onFavoriteTargetIdsChange
      ? favoriteTargetIds
      : localFavoriteTargetIds;

  function change_favorite_target_ids(nextTargetIds: string[]) {
    if (favoriteTargetIds === undefined || !onFavoriteTargetIdsChange) {
      setLocalFavoriteTargetIds(nextTargetIds);
    }

    onFavoriteTargetIdsChange?.(nextTargetIds);
  }

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

  function open_session_context_menu(event: React.MouseEvent, nextSession: LogSession) {
    event.preventDefault();
    setContextMenuState({
      x: event.clientX,
      y: event.clientY,
      session: nextSession,
    });
  }

  return (
    <section
      className={`flex min-h-0 w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0b1020] text-slate-100 shadow-2xl shadow-black/20 ${className}`}
    >
      <LogTargetHeader
        targets={targets}
        selectedTarget={target}
        selectedTargetId={targetId}
        displayMode={targetDisplayMode}
        label={targetLabel}
        onTargetChange={change_target}
        favoriteTargetIds={activeFavoriteTargetIds}
        onFavoriteTargetIdsChange={change_favorite_target_ids}
      />
      <div className="grid min-h-0 flex-1 grid-cols-[18rem_minmax(0,1fr)]">
        <LogHistoryPane
          sessions={targetSessions}
          selectedSessionId={sessionId}
          onSessionChange={change_session}
          onSessionContextMenu={open_session_context_menu}
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
          onOpenLogFolder={onOpenLogFolder}
          onOpenLogFile={onOpenLogFile}
          onRevealLogFile={onRevealLogFile}
        />
      </div>
      <LogSessionContextMenu
        state={contextMenuState}
        onClose={() => setContextMenuState(null)}
        onOpenLogFile={onOpenLogFile}
        onRevealLogFile={onRevealLogFile}
      />
    </section>
  );
}

function LogTargetHeader({
  targets,
  selectedTarget,
  selectedTargetId,
  displayMode,
  label,
  onTargetChange,
  favoriteTargetIds,
  onFavoriteTargetIdsChange,
}: {
  targets: LogTarget[];
  favoriteTargetIds: string[];
  selectedTarget?: LogTarget;
  selectedTargetId: string;
  displayMode: LogTargetDisplayMode;
  label?: string;
  onTargetChange: (targetId: string) => void;
  onFavoriteTargetIdsChange: (targetIds: string[]) => void;
}) {
  const targetOptions = targets.map(target_to_select_option);

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
        <span className="inline-flex min-w-[5.5rem] justify-center rounded bg-white/[0.05] px-2 py-1 text-center text-xs tabular-nums text-slate-500">
          {targets.length} targets
        </span>
      </div>

      <SelectMenu
        value={selectedTargetId}
        options={targetOptions}
        label="Log target"
        enableFavorites
        favoriteValues={favoriteTargetIds}
        onFavoriteValuesChange={onFavoriteTargetIdsChange}
        searchPlaceholder="Search log targets"
        onChange={onTargetChange}
      />
    </header>
  );
}

function LogHistoryPane({
  sessions,
  selectedSessionId,
  onSessionChange,
  onSessionContextMenu,
}: {
  sessions: LogSession[];
  selectedSessionId: string;
  onSessionChange: (sessionId: string) => void;
  onSessionContextMenu: (event: React.MouseEvent, session: LogSession) => void;
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
            onContextMenu={(event) => onSessionContextMenu(event, session)}
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
  onContextMenu,
}: {
  session: LogSession;
  selected: boolean;
  onClick: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
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
  onOpenLogFolder,
  onOpenLogFile,
  onRevealLogFile,
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
  onOpenLogFolder?: () => void;
  onOpenLogFile?: (session: LogSession) => void;
  onRevealLogFile?: (session: LogSession) => void;
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
        onOpenLogFolder={onOpenLogFolder}
        onOpenLogFile={onOpenLogFile}
        onRevealLogFile={onRevealLogFile}
      />
      <LogTextPanel
        entries={entries}
        text={logText}
        scrollScopeKey={selectedSession?.id ?? "no-session"}
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
  onOpenLogFolder,
  onOpenLogFile,
  onRevealLogFile,
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
  onOpenLogFolder?: () => void;
  onOpenLogFile?: (session: LogSession) => void;
  onRevealLogFile?: (session: LogSession) => void;
}) {
  const hasSelectedSessionFile = Boolean(selectedSession && log_session_file_target(selectedSession));
  const hasSelectedSessionFolder = Boolean(selectedSession && log_session_reveal_target(selectedSession));

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
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2.5 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.07] hover:text-white"
            onClick={onOpenLogFolder}
          >
            <FolderOpen size={14} />
            Log folder
          </button>
          <button
            type="button"
            disabled={!hasSelectedSessionFolder}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2.5 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
            onClick={() => selectedSession && onOpenLogFile?.(selectedSession)}
          >
            <FileText size={14} />
            Open file
          </button>
          <button
            type="button"
            disabled={!hasSelectedSessionFile}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2.5 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
            onClick={() => selectedSession && onRevealLogFile?.(selectedSession)}
          >
            <ExternalLink size={14} />
            Show in folder
          </button>
          <span className="inline-flex min-w-[5.75rem] justify-center rounded-md bg-white/[0.05] px-2 py-1 text-center text-xs tabular-nums text-slate-400">
            {visibleCount} / {totalCount}
          </span>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap gap-2">
        <label className="relative min-w-52 flex-1">
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
          className="h-9 min-w-36 flex-1 rounded-md border border-white/10 bg-[#0b1020] px-2 text-sm text-slate-200 outline-none focus:border-[rgb(var(--accent-rgb))] focus:ring-2 focus:ring-[rgb(var(--accent-rgb)/0.22)]"
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

function LogSessionContextMenu({
  state,
  onClose,
  onOpenLogFile,
  onRevealLogFile,
}: {
  state: { x: number; y: number; session: LogSession } | null;
  onClose: () => void;
  onOpenLogFile?: (session: LogSession) => void;
  onRevealLogFile?: (session: LogSession) => void;
}) {
  React.useEffect(() => {
    if (!state) {
      return undefined;
    }

    const close_menu = () => onClose();
    window.addEventListener("click", close_menu);
    window.addEventListener("keydown", close_menu);
    return () => {
      window.removeEventListener("click", close_menu);
      window.removeEventListener("keydown", close_menu);
    };
  }, [onClose, state]);

  if (!state) {
    return null;
  }

  const hasSessionFile = Boolean(log_session_file_target(state.session));
  const hasSessionFolder = Boolean(log_session_reveal_target(state.session));

  return (
    <div
      className="fixed z-50 min-w-44 overflow-hidden rounded-lg border border-white/10 bg-[#0f172a] p-1 text-sm text-slate-200 shadow-2xl shadow-black/45"
      style={{ left: state.x, top: state.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        disabled={!hasSessionFile}
        className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-45"
        onClick={() => {
          onOpenLogFile?.(state.session);
          onClose();
        }}
      >
        <FileText size={15} />
        Open log file
      </button>
      <button
        type="button"
        disabled={!hasSessionFolder}
        className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-45"
        onClick={() => {
          onRevealLogFile?.(state.session);
          onClose();
        }}
      >
        <FolderOpen size={15} />
        Open containing folder
      </button>
    </div>
  );
}

export interface LogTextPanelProps {
  text: string;
  entries?: LogEntry[];
  placeholder?: string;
  scrollScopeKey?: string;
}

export function LogTextPanel({
  text,
  entries = [],
  placeholder = "No logs match the current filters.",
  scrollScopeKey = "default",
}: LogTextPanelProps) {
  const textPanelRef = React.useRef<HTMLPreElement>(null);
  const shouldStickToBottomRef = React.useRef(true);
  const lastScrollScopeKeyRef = React.useRef(scrollScopeKey);

  React.useLayoutEffect(() => {
    const textPanel = textPanelRef.current;

    if (!textPanel) {
      return;
    }

    const scopeChanged = lastScrollScopeKeyRef.current !== scrollScopeKey;

    if (scopeChanged) {
      shouldStickToBottomRef.current = true;
      lastScrollScopeKeyRef.current = scrollScopeKey;
    }

    if (shouldStickToBottomRef.current) {
      textPanel.scrollTop = textPanel.scrollHeight;
    }
  }, [scrollScopeKey, text]);

  function remember_scroll_position(event: React.UIEvent<HTMLPreElement>) {
    shouldStickToBottomRef.current = is_log_panel_at_bottom(event.currentTarget);
  }

  return (
    <div className="min-h-0 flex-1 bg-[#0b1020] p-3">
      <pre
        ref={textPanelRef}
        aria-label="Selected log content"
        className="h-full select-text overflow-auto rounded-md border border-white/10 bg-[#050914] p-3 font-mono text-xs leading-5 text-slate-200 selection:bg-[rgb(var(--accent-rgb)/0.32)] selection:text-white"
        onScroll={remember_scroll_position}
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
    <span className={`inline-flex shrink-0 justify-center rounded bg-white/10 px-1.5 py-0.5 text-center text-[11px] tabular-nums text-slate-300 ${suffix ? "min-w-[4.25rem]" : "min-w-8"}`}>
      {suffix ? `${value} ${suffix}` : value}
    </span>
  );
}

function is_log_panel_at_bottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= LOG_BOTTOM_STICKY_THRESHOLD;
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

function target_to_select_option(target: LogTarget): SelectMenuOption {
  const description =
    target.kind === "app"
      ? `${target.count} app log sessions`
      : `${target.count} bottle log sessions`;

  return {
    value: target.id,
    label: target.label,
    description:
      target.runningCount > 0
        ? `${description} - ${target.runningCount} running`
        : description,
  };
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

  return (
    sessions.find((session) => (session.count ?? 0) > 0)?.id ??
    sessions[0]?.id ??
    ""
  );
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

export function log_session_file_path(session: LogSession): string | undefined {
  return log_session_file_target(session);
}

export function log_session_reveal_path(session: LogSession): string | undefined {
  return log_session_reveal_target(session);
}

function log_session_file_target(session: LogSession): string | undefined {
  return session.logFilePath ?? session.logFileName;
}

function log_session_reveal_target(session: LogSession): string | undefined {
  return session.logFilePath ?? session.logDirectoryPath ?? session.logFileName;
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
