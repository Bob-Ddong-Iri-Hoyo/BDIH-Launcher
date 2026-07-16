import type { Meta, StoryObj } from "@storybook/react";
import { BDIH_GITHUB_URL, BDIH_SITE_URL, BDIH_YOUTUBE_URL } from "../../../Common/Constant/RuntimeSources";
import { DeveloperYouTubeLink } from "../../Component/DeveloperLinks";
import { PreferenceView } from "../../View/PreferenceView/PreferenceView";

const meta: Meta<typeof PreferenceView> = {
  title: "View/PreferenceView",
  component: PreferenceView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    dataRootPath: "~/Library/Application Support/BDIH Launcher",
    installPath: "~/Library/Application Support/BDIH Launcher/Wine",
    bottlePrefixPath: "~/Library/Application Support/BDIH Launcher/Bottles",
    dxmtCachePath: "~/Library/Application Support/BDIH Launcher/DXMT",
    gameInstallPath: "~/Library/Application Support/BDIH Launcher/Games",
    themeMode: "system",
    appLoggingLevel: "off",
    debugFlagMode: "preset",
    loggingLevel: "off",
    wineDebugArgs: "-all,+seh,+tid",
    shortcuts: {
      launch: "Command + Return",
      logs: "Command + L",
      preferences: "Command + ,",
      logFind: "Command + F",
      logFindNext: "Command + N",
      logFindPrevious: "Command + P",
    },
    accentColor: "rose",
    autoUpdateEnabled: true,
    developerSiteUrl: BDIH_SITE_URL,
    developerGitHubUrl: BDIH_GITHUB_URL,
    developerYouTubeUrl: BDIH_YOUTUBE_URL,
    onDataRootPathChange: () => undefined,
    onInstallPathChange: () => undefined,
    onBottlePrefixPathChange: () => undefined,
    onDxmtCachePathChange: () => undefined,
    onGameInstallPathChange: () => undefined,
    onLocaleChange: () => undefined,
    onAccentColorChange: () => undefined,
    onThemeModeChange: () => undefined,
    onAppLoggingLevelChange: () => undefined,
    onDebugFlagModeChange: () => undefined,
    onLoggingLevelChange: () => undefined,
    onWineDebugArgsChange: () => undefined,
    onShortcutChange: () => undefined,
    onAutoUpdateEnabledChange: () => undefined,
    onCheckForUpdates: () => undefined,
    onBrowsePath: () => undefined,
    onResetPath: () => undefined,
    onDeleteLauncherData: () => undefined,
    onSave: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof PreferenceView>;

export const Default: Story = {
  render: (args) => (
    <div className="h-dvh overflow-hidden bg-[#0b1020] text-slate-100">
      <PreferenceView {...args} />
    </div>
  ),
};

export const WineSettings: Story = {
  args: {
    initialCategory: "wine",
    initialHasChanges: true,
  },
  render: (args) => (
    <div className="h-dvh overflow-hidden bg-[#0b1020] text-slate-100">
      <PreferenceView {...args} />
    </div>
  ),
};

export const ShortcutSettings: Story = {
  args: {
    initialCategory: "shortcut",
  },
  render: (args) => (
    <div className="h-dvh overflow-hidden bg-[#0b1020] text-slate-100">
      <PreferenceView {...args} />
    </div>
  ),
};

export const DeveloperOnAir: Story = {
  args: {
    isDeveloperOnAir: true,
  },
  render: (args) => (
    <div className="h-dvh overflow-hidden bg-[#0b1020] text-slate-100">
      <PreferenceView {...args} />
    </div>
  ),
};

export const GeneralWithUpdateDownloading: Story = {
  args: {
    appUpdateStatus: {
      status: "downloading",
      message: "Downloading update.",
      progress: 62,
      version: "1.1.0",
    },
  },
  render: (args) => (
    <div className="h-dvh overflow-hidden bg-[#0b1020] text-slate-100">
      <PreferenceView {...args} />
    </div>
  ),
};

export const DeveloperYouTubeBadgeStates: Story = {
  parameters: {
    layout: "centered",
  },
  render: () => (
    <div className="min-h-dvh w-dvw bg-[#0b1020] p-10 text-slate-100">
      <div className="mx-auto grid max-w-2xl gap-8 md:grid-cols-2">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase text-slate-500">OFFLINE</p>
          <DeveloperYouTubeLink url={BDIH_YOUTUBE_URL} isOnAir={false} />
        </div>
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase text-red-300">ON AIR Glow</p>
          <DeveloperYouTubeLink url={BDIH_YOUTUBE_URL} isOnAir />
        </div>
      </div>
    </div>
  ),
};
