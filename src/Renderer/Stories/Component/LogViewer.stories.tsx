import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { FileText, Play, ScrollText } from "lucide-react";
import {
  LogBottleAppFilter,
  LogContent,
  LogEntry,
  LogHistoryPane,
  LogAppSummaryHeader,
  LogModeMenu,
  LogSession,
  LogSourceOption,
  LogTargetHeader,
  LogTextPanel,
  LogToolbar,
  LogViewer,
  SessionButton,
} from "../../Component/LogViewer";
import { Dialog, DialogHost } from "../../Component/Dialog";

const meta: Meta<typeof LogViewer> = {
  title: "Component/LogViewer",
  component: LogViewer,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof LogViewer>;

const SOURCES: LogSourceOption[] = [
  { id: "app", label: "App" },
  { id: "renderer", label: "Renderer" },
  { id: "bottle-runner", label: "Bottle Runner" },
  { id: "wine", label: "Wine" },
  { id: "updater", label: "Updater" },
  { id: "download", label: "Download" },
];

const SESSIONS: LogSession[] = [
  {
    id: "2026-05-16-2102",
    label: "Running",
    startedAt: "2026-05-16T12:02:00.000Z",
    kind: "bottle",
    bottleId: "hoyoverse",
    bottleName: "HoyoVerse Bottle",
    logFileName: "wine-hoyoverse__genshin-impact.log",
    count: 12,
    isRunning: true,
  },
  {
    id: "2026-05-16-2107",
    label: "Running",
    startedAt: "2026-05-16T12:07:00.000Z",
    kind: "bottle",
    bottleId: "eternal-return",
    bottleName: "Eternal Return",
    logFileName: "wine-eternal-return__eternal-return.log",
    count: 4,
    isRunning: true,
  },
  {
    id: "2026-05-16-1828",
    label: "2026-05-16",
    startedAt: "2026-05-16T09:28:00.000Z",
    kind: "app",
    count: 8,
  },
  {
    id: "2026-05-15-2314",
    label: "2026-05-15",
    startedAt: "2026-05-15T14:14:00.000Z",
    kind: "app",
    count: 10,
  },
];

const LOGS_BY_SESSION: Record<string, LogEntry[]> = {
  "2026-05-16-2102": [
    {
      id: "1",
      sessionId: "2026-05-16-2102",
      timestamp: "2026-05-16T12:02:12.000Z",
      level: "info",
      category: "app",
      source: "app",
      message: "Application boot sequence started.",
    },
    {
      id: "2",
      sessionId: "2026-05-16-2102",
      timestamp: "2026-05-16T12:02:13.000Z",
      level: "debug",
      category: "app",
      source: "renderer",
      message: "Loaded MainView bundle.",
      detail: "MainView.bundle.js resolved from dist/renderer/View.",
    },
    {
      id: "3",
      sessionId: "2026-05-16-2102",
      timestamp: "2026-05-16T12:02:14.000Z",
      level: "info",
      category: "wine",
      source: "wine",
      message: "Wine catalog loaded.",
    },
    {
      id: "4",
      sessionId: "2026-05-16-2102",
      timestamp: "2026-05-16T12:02:15.000Z",
      level: "warn",
      category: "app",
      source: "updater",
      message: "Update checks are disabled outside packaged builds.",
    },
    {
      id: "5",
      sessionId: "2026-05-16-2102",
      timestamp: "2026-05-16T12:02:18.000Z",
      level: "debug",
      category: "wine",
      source: "download",
      message: "curl progress event received.",
      detail: "progress=34.2 url=https://example.invalid/wine.tar.gz",
    },
    {
      id: "6",
      sessionId: "2026-05-16-2102",
      timestamp: "2026-05-16T12:02:22.000Z",
      level: "info",
      category: "bottle",
      source: "bottle-runner",
      bottleId: "hoyoverse",
      bottleName: "HoyoVerse Bottle",
      message: "Launch request accepted for Genshin Impact.",
    },
    {
      id: "7",
      sessionId: "2026-05-16-2102",
      timestamp: "2026-05-16T12:02:26.000Z",
      level: "info",
      category: "wine",
      source: "wine",
      bottleId: "hoyoverse",
      bottleName: "HoyoVerse Bottle",
      message: "wine64 process started.",
      detail:
        "WINEPREFIX=/Users/player/Library/Application Support/BDIH/Bottles/hoyoverse\nCommand=wine64 launcher.exe",
    },
    {
      id: "8",
      sessionId: "2026-05-16-2102",
      timestamp: "2026-05-16T12:02:31.000Z",
      level: "info",
      category: "app",
      source: "renderer",
      message: "User opened Wine manager panel.",
    },
    {
      id: "9",
      sessionId: "2026-05-16-2102",
      timestamp: "2026-05-16T12:02:38.000Z",
      level: "warn",
      category: "app",
      source: "app",
      message: "Preference file did not exist; default preference was used.",
    },
    {
      id: "10",
      sessionId: "2026-05-16-2102",
      timestamp: "2026-05-16T12:02:43.000Z",
      level: "debug",
      category: "wine",
      source: "wine",
      bottleId: "hoyoverse",
      bottleName: "HoyoVerse Bottle",
      message: "Resolved install directory.",
      detail: "/Users/player/Library/Application Support/BDIH Launcher/wine",
    },
    {
      id: "11",
      sessionId: "2026-05-16-2102",
      timestamp: "2026-05-16T12:02:49.000Z",
      level: "info",
      category: "app",
      source: "app",
      message: "Main window became visible.",
    },
    {
      id: "12",
      sessionId: "2026-05-16-2102",
      timestamp: "2026-05-16T12:02:55.000Z",
      level: "error",
      category: "app",
      source: "renderer",
      message: "Renderer process reported a recoverable UI error.",
      detail: "Component stack: InstalledWinePanel > WineVersionCard",
    },
  ],
  "2026-05-16-2107": [
    {
      id: "er-1",
      sessionId: "2026-05-16-2107",
      timestamp: "2026-05-16T12:07:03.000Z",
      level: "info",
      category: "bottle",
      source: "bottle-runner",
      bottleId: "eternal-return",
      bottleName: "Eternal Return",
      message: "Launch request accepted for Eternal Return.",
    },
    {
      id: "er-2",
      sessionId: "2026-05-16-2107",
      timestamp: "2026-05-16T12:07:06.000Z",
      level: "debug",
      category: "wine",
      source: "wine",
      bottleId: "eternal-return",
      bottleName: "Eternal Return",
      message: "Preparing isolated Wine prefix.",
      detail: "WINEPREFIX=/Users/player/Library/Application Support/BDIH/Bottles/eternal-return",
    },
    {
      id: "er-3",
      sessionId: "2026-05-16-2107",
      timestamp: "2026-05-16T12:07:11.000Z",
      level: "info",
      category: "wine",
      source: "wine",
      bottleId: "eternal-return",
      bottleName: "Eternal Return",
      message: "wine64 process started.",
    },
    {
      id: "er-4",
      sessionId: "2026-05-16-2107",
      timestamp: "2026-05-16T12:07:18.000Z",
      level: "warn",
      category: "bottle",
      source: "bottle-runner",
      bottleId: "eternal-return",
      bottleName: "Eternal Return",
      message: "Game window focus was delayed.",
    },
  ],
  "2026-05-16-1828": [
    {
      id: "old-1",
      sessionId: "2026-05-16-1828",
      timestamp: "2026-05-16T09:28:01.000Z",
      level: "info",
      category: "app",
      source: "app",
      message: "Application boot sequence started.",
    },
    {
      id: "old-2",
      sessionId: "2026-05-16-1828",
      timestamp: "2026-05-16T09:28:04.000Z",
      level: "info",
      category: "wine",
      source: "wine",
      message: "Wine catalog loaded from predefined constants.",
    },
    {
      id: "old-3",
      sessionId: "2026-05-16-1828",
      timestamp: "2026-05-16T09:28:09.000Z",
      level: "debug",
      category: "app",
      source: "renderer",
      message: "PreferenceView story resources initialized.",
    },
    {
      id: "old-4",
      sessionId: "2026-05-16-1828",
      timestamp: "2026-05-16T09:29:17.000Z",
      level: "warn",
      category: "wine",
      source: "download",
      message: "Network speed dropped below expected threshold.",
    },
  ],
  "2026-05-15-2314": [
    {
      id: "yesterday-1",
      sessionId: "2026-05-15-2314",
      timestamp: "2026-05-15T14:14:01.000Z",
      level: "info",
      category: "app",
      source: "app",
      message: "Application boot sequence started.",
    },
    {
      id: "yesterday-2",
      sessionId: "2026-05-15-2314",
      timestamp: "2026-05-15T14:14:12.000Z",
      level: "error",
      category: "app",
      source: "updater",
      message: "Failed to resolve update feed.",
      detail: "Error: publish provider is not configured for this build.",
    },
  ],
};

export const Default: Story = {
  name: "Default full",
  render: () => (
    <StorySurface>
      <LogViewerExample className="h-[620px]" />
    </StorySurface>
  ),
};

export const CompactDialog: Story = {
  name: "Compact dialog",
  render: () => (
    <DialogHost
      dialog={
        <Dialog
          open
          title="HoyoVerse Bottle logs"
          description="Running bottle session"
          tone="neutral"
          icon={ScrollText}
          placement="center"
          widthClassName="max-w-5xl"
          closeOnBackdrop={false}
          showCloseButton={false}
        >
          <LogViewerExample
            initialTargetId="bottle:hoyoverse"
            targetDisplayMode="label"
            targetLabel="HoyoVerse Bottle"
            className="h-[500px]"
          />
        </Dialog>
      }
    >
      <BottleDetailSurface />
    </DialogHost>
  ),
};

export const CompactDialogInteraction: Story = {
  name: "Compact dialog interaction",
  render: () => <CompactDialogInteractionExample />,
};

export const TargetHeaderPicker: Story = {
  name: "Parts / Target header picker",
  render: () => <TargetHeaderPickerExample />,
};

export const ModeMenuPart: Story = {
  name: "Parts / Mode menu",
  render: () => {
    const [mode, setMode] = useState<"app" | "bottle">("bottle");

    return (
      <StorySurface>
        <LogPartFrame title="LogModeMenu" className="max-w-3xl">
          <LogModeMenu
            mode={mode}
            appCount={2}
            bottleCount={2}
            onModeChange={setMode}
          />
        </LogPartFrame>
      </StorySurface>
    );
  },
};

export const AppSummaryHeaderPart: Story = {
  name: "Parts / App summary header",
  render: () => (
    <StorySurface>
      <LogPartFrame title="LogAppSummaryHeader" className="max-w-4xl">
        <LogAppSummaryHeader target={TARGETS[0]} />
      </LogPartFrame>
    </StorySurface>
  ),
};

export const TargetHeaderLabel: Story = {
  name: "Parts / Target header label",
  render: () => (
    <StorySurface>
      <LogPartFrame title="LogTargetHeader label mode">
        <LogTargetHeader
          targets={TARGETS}
          selectedTarget={TARGETS[1]}
          selectedTargetId={TARGETS[1].id}
          displayMode="label"
          label="HoyoVerse Bottle"
          favoriteTargetIds={["bottle:hoyoverse"]}
          onTargetChange={() => undefined}
          onFavoriteTargetIdsChange={() => undefined}
        />
      </LogPartFrame>
    </StorySurface>
  ),
};

export const BottleAppFilterPart: Story = {
  name: "Parts / Bottle app filter",
  render: () => {
    const [selectedValues, setSelectedValues] = useState<string[]>([]);

    return (
      <StorySurface>
        <LogPartFrame title="LogBottleAppFilter" className="max-w-4xl">
          <LogBottleAppFilter
            options={[
              {
                value: "genshin-impact",
                label: "Genshin Impact",
                count: 4,
                isRunning: true,
              },
              {
                value: "hoyoplay",
                label: "HoYoPlay",
                count: 3,
                isRunning: false,
              },
              {
                value: "steam",
                label: "Steam",
                count: 2,
                isRunning: false,
              },
            ]}
            selectedValues={selectedValues}
            onSelectedValuesChange={setSelectedValues}
          />
        </LogPartFrame>
      </StorySurface>
    );
  },
};

export const HistoryPanePart: Story = {
  name: "Parts / History pane",
  render: () => {
    const bottleSessions = SESSIONS.filter((session) => session.kind === "bottle");

    return (
      <StorySurface>
        <LogPartFrame title="LogHistoryPane" className="h-[360px] max-w-sm">
          <LogHistoryPane
            sessions={bottleSessions}
            selectedSessionId={bottleSessions[0]?.id ?? ""}
            onSessionChange={() => undefined}
            onSessionContextMenu={(event) => event.preventDefault()}
          />
        </LogPartFrame>
      </StorySurface>
    );
  },
};

export const SessionButtonStates: Story = {
  name: "Parts / Session button states",
  render: () => (
    <StorySurface>
      <LogPartFrame title="SessionButton states" className="max-w-sm">
        <div className="flex flex-col gap-2">
          <SessionButton
            session={SESSIONS[0]}
            selected
            onClick={() => undefined}
            onContextMenu={(event) => event.preventDefault()}
          />
          <SessionButton
            session={SESSIONS[2]}
            selected={false}
            onClick={() => undefined}
            onContextMenu={(event) => event.preventDefault()}
          />
        </div>
      </LogPartFrame>
    </StorySurface>
  ),
};

export const ToolbarPart: Story = {
  name: "Parts / Toolbar",
  render: () => (
    <StorySurface>
      <LogPartFrame title="LogToolbar" className="max-w-5xl">
        <LogToolbar
          selectedSession={SESSIONS[0]}
          sources={SOURCES.map((source) => ({ ...source, count: 4 }))}
          selectedSourceId="all"
          selectedLevel="all"
          searchValue=""
          visibleCount={12}
          totalCount={42}
          onSourceChange={() => undefined}
          onLevelChange={() => undefined}
          onSearchChange={() => undefined}
          onOpenLogFolder={() => undefined}
          onOpenLogFile={() => undefined}
          onRevealLogFile={() => undefined}
        />
      </LogPartFrame>
    </StorySurface>
  ),
};

export const TextPanelPart: Story = {
  name: "Parts / Text panel",
  render: () => (
    <StorySurface>
      <LogPartFrame title="LogTextPanel" className="h-[360px] max-w-5xl">
        <LogTextPanel
          entries={LOGS_BY_SESSION["2026-05-16-2102"]}
          text={LOGS_BY_SESSION["2026-05-16-2102"].map(format_story_log_line).join("\n")}
          scrollScopeKey="story-text-panel"
        />
      </LogPartFrame>
    </StorySurface>
  ),
};

export const ContentPart: Story = {
  name: "Parts / Content pane",
  render: () => {
    const entries = LOGS_BY_SESSION["2026-05-16-2102"];

    return (
      <StorySurface>
        <LogPartFrame title="LogContent" className="h-[520px] max-w-5xl">
          <LogContent
            entries={entries}
            logText={entries.map(format_story_log_line).join("\n")}
            selectedSession={SESSIONS[0]}
            sources={SOURCES.map((source) => ({
              ...source,
              count: entries.filter((entry) => entry.source === source.id).length,
            }))}
            selectedSourceId="all"
            selectedLevel="all"
            searchValue=""
            visibleCount={entries.length}
            totalCount={entries.length}
            onSourceChange={() => undefined}
            onLevelChange={() => undefined}
            onSearchChange={() => undefined}
            onOpenLogFolder={() => undefined}
            onOpenLogFile={() => undefined}
            onRevealLogFile={() => undefined}
          />
        </LogPartFrame>
      </StorySurface>
    );
  },
};


const TARGETS = [
  {
    id: "app",
    label: "App Logs",
    kind: "app" as const,
    count: 2,
    runningCount: 1,
  },
  {
    id: "bottle:hoyoverse",
    label: "HoyoVerse Bottle",
    kind: "bottle" as const,
    bottleId: "hoyoverse",
    count: 1,
    runningCount: 1,
  },
  {
    id: "bottle:eternal-return",
    label: "Eternal Return",
    kind: "bottle" as const,
    bottleId: "eternal-return",
    count: 1,
    runningCount: 1,
  },
];

function TargetHeaderPickerExample() {
  const [targetId, setTargetId] = useState(TARGETS[1].id);
  const [favorites, setFavorites] = useState(["bottle:hoyoverse"]);
  const selectedTarget = TARGETS.find((target) => target.id === targetId) ?? TARGETS[0];

  return (
    <StorySurface>
      <LogPartFrame title="LogTargetHeader picker mode">
        <LogTargetHeader
          targets={TARGETS}
          selectedTarget={selectedTarget}
          selectedTargetId={targetId}
          displayMode="picker"
          favoriteTargetIds={favorites}
          onTargetChange={setTargetId}
          onFavoriteTargetIdsChange={setFavorites}
        />
      </LogPartFrame>
    </StorySurface>
  );
}

function LogPartFrame({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={"overflow-hidden rounded-xl border border-white/10 bg-[#0b1020] shadow-2xl shadow-black/20 " + className}>
      <div className="border-b border-white/10 bg-[#101827] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </div>
      {children}
    </div>
  );
}

function format_story_log_line(entry: LogEntry): string {
  const bottle = entry.bottleName ? " [" + entry.bottleName + "]" : "";
  const category = entry.category ? entry.category + ":" : "";
  const line = entry.timestamp + " [" + entry.level.toUpperCase() + "] [" + category + entry.source + "]" + bottle + " " + entry.message;

  return entry.detail ? line + "\n" + entry.detail : line;
}

function CompactDialogInteractionExample() {
  const [open, setOpen] = useState(false);

  return (
    <DialogHost
      dialog={
        <Dialog
          open={open}
          title="HoyoVerse Bottle logs"
          description="Running bottle session"
          tone="neutral"
          icon={ScrollText}
          placement="center"
          widthClassName="max-w-5xl"
          onClose={() => setOpen(false)}
          actions={[
            {
              label: "Close",
              onClick: () => setOpen(false),
            },
          ]}
        >
          <LogViewerExample
            initialTargetId="bottle:hoyoverse"
            targetDisplayMode="label"
            targetLabel="HoyoVerse Bottle"
            className="h-[500px]"
          />
        </Dialog>
      }
    >
      <BottleDetailSurface onOpenLogs={() => setOpen(true)} />
    </DialogHost>
  );
}

function LogViewerExample({
  initialTargetId,
  targetDisplayMode,
  targetLabel,
  className,
}: {
  initialTargetId?: string;
  targetDisplayMode?: "picker" | "label";
  targetLabel?: string;
  className?: string;
}) {
  const [targetId, setTargetId] = useState(initialTargetId);
  const entries = useMemo(() => Object.values(LOGS_BY_SESSION).flat(), []);

  const sources = useMemo(() => {
    return SOURCES.map((source) => ({
      ...source,
      count: entries.filter((entry) => entry.source === source.id).length,
    }));
  }, [entries]);

  return (
    <LogViewer
      entries={entries}
      sessions={SESSIONS}
      sources={sources}
      selectedTargetId={targetId}
      favoriteTargetIds={["bottle:hoyoverse"]}
      targetDisplayMode={targetDisplayMode}
      targetLabel={targetLabel}
      onTargetChange={setTargetId}
      className={className}
    />
  );
}

function StorySurface({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-[#070b16] p-6">{children}</div>;
}

function BottleDetailSurface({
  onOpenLogs,
}: {
  onOpenLogs?: () => void;
}) {
  return (
    <StorySurface>
      <main className="mx-auto flex max-w-5xl flex-col gap-4 text-slate-100">
        <header className="flex min-w-0 items-center justify-between gap-4 rounded-lg border border-white/10 bg-[#0b1020] p-5">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.04]">
                <Play size={18} className="text-emerald-200" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold text-white">
                  HoyoVerse Bottle
                </h1>
                <p className="mt-1 truncate text-sm text-slate-500">
                  Running / wine64 launcher.exe
                </p>
              </div>
            </div>
          </div>
          {onOpenLogs ? (
            <button
              type="button"
              onClick={onOpenLogs}
              className="accent-primary inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-4 text-sm font-semibold transition"
            >
              <ScrollText size={16} />
              View logs
            </button>
          ) : (
            <span className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-sm font-medium text-emerald-100">
              Running
            </span>
          )}
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          {[
            ["Game", "Genshin Impact"],
            ["Prefix", "hoyoverse"],
            ["Wine", "wine-staging 9.22"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border border-white/10 bg-[#0b1020] p-4"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                <FileText size={15} className="text-slate-500" />
                <span>{label}</span>
              </div>
              <p className="mt-2 truncate text-sm text-slate-500">{value}</p>
            </div>
          ))}
        </section>
      </main>
    </StorySurface>
  );
}
