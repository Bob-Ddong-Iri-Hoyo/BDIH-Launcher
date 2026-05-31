import type { Meta, StoryObj } from "@storybook/react";
import { useMemo } from "react";
import {
  LogEntry,
  LogSession,
  LogSourceOption,
  LogViewer,
} from "../../Component/LogViewer";

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
    count: 12,
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
  render: () => <LogViewerStoryContent />,
};

function LogViewerStoryContent() {
  const entries = useMemo(() => Object.values(LOGS_BY_SESSION).flat(), []);

  const sources = useMemo(() => {
    return SOURCES.map((source) => ({
      ...source,
      count: entries.filter((entry) => entry.source === source.id).length,
    }));
  }, [entries]);

  return (
    <div className="min-h-dvh bg-[#070b16] p-6">
      <LogViewer
        entries={entries}
        sessions={SESSIONS}
        sources={sources}
        className="h-[620px]"
      />
    </div>
  );
}

export const Empty: Story = {
  render: () => (
    <div className="min-h-dvh bg-[#070b16] p-6">
      <LogViewer
        entries={[]}
        sessions={SESSIONS.map((session) => ({ ...session, count: 0 }))}
        sources={SOURCES.map((source) => ({ ...source, count: 0 }))}
        className="h-[420px]"
      />
    </div>
  ),
};
