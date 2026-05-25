import type { Meta, StoryObj } from "@storybook/react";
import { useMemo, useState } from "react";
import { PREDEFINED_WINE_VERSIONS } from "../../../Common/Constant/WineCatalog";
import { RendererViewKey } from "../../Component/MainFrame";
import type { Bottle } from "../../Types/Bottle";
import { DashboardView, LauncherView } from "../../View/MainView/MainView";

const wineVersions = PREDEFINED_WINE_VERSIONS.map((version, index) =>
  index === 0
    ? {
        ...version,
        status: "installed" as const,
        progress: 100,
        path: "~/Library/Application Support/BDIH/Wine/wine-9.0-stable",
      }
    : version,
);

const bottles: Bottle[] = [
  {
    id: "hoyoverse",
    name: "HoyoVerse Bottle",
    description: "Shared launcher profile for HoyoVerse titles.",
    wineVersionId: "ge-proton-latest",
    path: "~/Library/Application Support/BDIH/Bottles/hoyoverse",
    status: "ready",
    apps: [
      {
        id: "genshin",
        name: "Genshin Impact",
        subtitle: "HoyoVerse Launcher",
        wineVersionId: "ge-proton-latest",
        lastPlayed: "",
        lastPlayedKey: "main.lastPlayed.today",
        status: "ready",
      },
      {
        id: "starrail",
        name: "Honkai: Star Rail",
        subtitle: "DXMT profile",
        wineVersionId: "ge-proton-latest",
        lastPlayed: "",
        lastPlayedKey: "main.lastPlayed.yesterday",
        status: "ready",
      },
    ],
  },
  {
    id: "steam",
    name: "Steam Bottle",
    description: "Steam and library games using a dedicated prefix.",
    wineVersionId: "wine-9.0-stable",
    path: "~/Library/Application Support/BDIH/Bottles/steam",
    status: "updating",
    apps: [
      {
        id: "steam",
        name: "Steam",
        subtitle: "Wine 9 prefix",
        wineVersionId: "wine-9.0-stable",
        lastPlayed: "",
        lastPlayedKey: "main.lastPlayed.threeDaysAgo",
        status: "updating",
      },
    ],
  },
  {
    id: "custom-tools",
    name: "Custom Tools",
    description: "Manual executables and local test recipes.",
    wineVersionId: "wine-8.0-stable",
    path: "~/Library/Application Support/BDIH/Bottles/custom-tools",
    status: "needs-setup",
    apps: [
      {
        id: "custom",
        name: "Custom Windows App",
        subtitle: "Manual executable",
        wineVersionId: "wine-8.0-stable",
        lastPlayed: "",
        lastPlayedKey: "main.lastPlayed.never",
        status: "needs-prefix",
      },
    ],
  },
];

const logSessions = [
  {
    id: "2026-05-16-2102",
    label: "Running",
    startedAt: "2026-05-16T12:02:00.000Z",
    count: 8,
    isRunning: true,
  },
  {
    id: "2026-05-16-1828",
    label: "2026-05-16",
    startedAt: "2026-05-16T09:28:00.000Z",
    count: 4,
  },
  {
    id: "2026-05-15-2314",
    label: "2026-05-15",
    startedAt: "2026-05-15T14:14:00.000Z",
    count: 2,
  },
];

const logEntries = [
  {
    id: "1",
    timestamp: "2026-05-16T12:02:12.000Z",
    level: "info" as const,
    category: "app" as const,
    source: "app",
    message: "Application boot sequence started.",
  },
  {
    id: "2",
    timestamp: "2026-05-16T12:02:13.000Z",
    level: "debug" as const,
    category: "app" as const,
    source: "renderer",
    message: "Loaded MainView bundle.",
    detail: "MainView.bundle.js resolved from dist/renderer/View.",
  },
  {
    id: "3",
    timestamp: "2026-05-16T12:02:14.000Z",
    level: "info" as const,
    category: "wine" as const,
    source: "wine",
    message: "Wine catalog loaded.",
  },
  {
    id: "4",
    timestamp: "2026-05-16T12:02:15.000Z",
    level: "warn" as const,
    category: "app" as const,
    source: "updater",
    message: "Update checks are disabled outside packaged builds.",
  },
  {
    id: "5",
    timestamp: "2026-05-16T12:02:18.000Z",
    level: "debug" as const,
    category: "wine" as const,
    source: "download",
    message: "curl progress event received.",
    detail: "progress=34.2 url=https://example.invalid/wine.tar.gz",
  },
  {
    id: "6",
    timestamp: "2026-05-16T12:02:26.000Z",
    level: "error" as const,
    category: "wine" as const,
    source: "download",
    message: "Download failed with exit code 56.",
    detail:
      "Error: curl failed while receiving network data\n    at DownloadManager.startDownload\n    at WineManager.installWine",
  },
];

const logSources = ["app", "renderer", "wine", "updater", "download"].map((source) => ({
  id: source,
  label: source[0].toUpperCase() + source.slice(1),
  count: logEntries.filter((entry) => entry.source === source).length,
}));

const meta: Meta<typeof DashboardView> = {
  title: "View/MainView/DashboardView",
  component: DashboardView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    wineVersions,
    selectedWineVersion: wineVersions[0],
    selectedWineVersionId: wineVersions[0].id,
    installPath: "~/Library/Application Support/BDIH/Wine",
    isLoadingWineVersions: false,
    bottles,
    onSelectWineVersion: () => undefined,
    onInstallWineVersion: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof DashboardView>;

export const Default: Story = {
  render: (args) => (
    <div className="min-h-dvh bg-[#0b1020] text-slate-100">
      <DashboardView {...args} />
    </div>
  ),
};

export const LoadingCatalog: Story = {
  args: {
    isLoadingWineVersions: true,
    selectedWineVersion: {
      ...wineVersions[1],
      status: "downloading",
      progress: 38,
    },
    selectedWineVersionId: wineVersions[1].id,
    wineVersions: wineVersions.map((version, index) =>
      index === 1
        ? {
            ...version,
            status: "downloading" as const,
            progress: 38,
          }
        : version,
    ),
  },
  render: Default.render,
};

export const LauncherShell: StoryObj<typeof LauncherView> = {
  name: "LauncherView",
  render: () => <LauncherShellStory />,
  parameters: {
    layout: "fullscreen",
  },
};

function LauncherShellStory() {
  const [activeView, setActiveView] = useState<RendererViewKey>("dashboard");
  const statusText = useMemo(() => {
    if (activeView === "logs") {
      return "Viewing launcher log session from Storybook.";
    }

    if (activeView === "terminal") {
      return "Terminal preview is open.";
    }

    return "Wine catalog loaded from local defaults.";
  }, [activeView]);

  return (
    <LauncherView
      activeView={activeView}
      statusText={statusText}
      wineVersions={wineVersions}
      selectedWineVersion={wineVersions[0]}
      selectedWineVersionId={wineVersions[0].id}
      installPath="~/Library/Application Support/BDIH/Wine"
      isLoadingWineVersions={false}
      bottles={bottles}
      logEntries={logEntries}
      logSessions={logSessions}
      logSources={logSources}
      onViewChange={setActiveView}
      onQuit={() => undefined}
      onMinimize={() => undefined}
      onMaximize={() => undefined}
      isMac
      onSelectWineVersion={() => undefined}
      onInstallWineVersion={() => undefined}
      onInstallPathChange={() => undefined}
      onLocaleChange={() => undefined}
      onAccentColorChange={() => undefined}
      onResetInstallPath={() => undefined}
    />
  );
}
