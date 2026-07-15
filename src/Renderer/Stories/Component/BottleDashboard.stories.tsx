import type { Meta, StoryObj } from "@storybook/react";
import {
  BottleCard,
  BottleDetailPanel,
  CreateBottleDialog,
  DashboardBreadcrumb,
  DashboardHomePanel,
} from "../../Component/BottleDashboard";
import { mockBottle, mockBottles, mockDxmtVersions, mockWineVersions } from "./mockData";

const meta: Meta<typeof DashboardHomePanel> = {
  title: "Component/BottleDashboard",
  component: DashboardHomePanel,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    wineVersions: mockWineVersions,
    dxmtVersions: mockDxmtVersions,
    selectedWineVersionId: mockWineVersions[0].id,
    selectedDxmtVersionId: mockDxmtVersions[0].id,
    installPath: "~/Library/Application Support/BDIH/Wine",
    isLoadingWineVersions: false,
    isLoadingDxmtVersions: false,
    bottles: mockBottles,
    isInstalledWineOpen: false,
    onToggleInstalledWine: () => undefined,
    onSelectWineVersion: () => undefined,
    onInstallWineVersion: () => undefined,
    onDeleteWineVersion: () => undefined,
    onSelectDxmtVersion: () => undefined,
    onInstallDxmtVersion: () => undefined,
    onDeleteDxmtVersion: () => undefined,
    onSelectBottle: () => undefined,
    onBottleContextMenu: () => undefined,
    onCreateBottle: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof DashboardHomePanel>;

export const HomePanel: Story = {
  render: (args) => (
    <div className="min-h-dvh bg-[#0b1020] text-slate-100">
      <DashboardHomePanel {...args} />
    </div>
  ),
};

export const InstalledWineOpen: Story = {
  args: {
    isInstalledWineOpen: true,
  },
  render: HomePanel.render,
};

export const DetailPanel: StoryObj<typeof BottleDetailPanel> = {
  render: () => (
    <div className="min-h-dvh bg-[#0b1020] text-slate-100">
      <BottleDetailPanel
        bottle={mockBottles[1]}
        selectedWineVersionId={mockWineVersions[0].id}
        wineVersions={mockWineVersions}
        dxmtVersions={mockDxmtVersions}
        wineRuntimePath="~/Library/Application Support/BDIH/Wine/wine-9.0-stable"
        appLogoSrc="https://bdih.faby.day/favicon.ico"
        onRevealBottle={() => undefined}
        onInstallBottleLauncher={() => undefined}
        onLaunchBottleApp={() => undefined}
        onLaunchBottleAppWithArgs={() => undefined}
        onStopBottleApp={() => undefined}
        onDeleteBottleApp={() => undefined}
        onRegisterBottleExecutable={() => undefined}
        onChangeBottleRecipe={() => undefined}
        onInstallWineVersion={() => undefined}
        onInstallDxmtVersion={() => undefined}
      />
    </div>
  ),
};

export const CreateDialog: StoryObj<typeof CreateBottleDialog> = {
  render: () => (
    <div className="min-h-dvh bg-[#0b1020] p-6 text-slate-100">
      <CreateBottleDialog
        open
        wineVersions={mockWineVersions}
        dxmtVersions={mockDxmtVersions}
        selectedWineVersionId={mockWineVersions[0].id}
        selectedDxmtVersionId={mockDxmtVersions[0].id}
        bottlePrefixPath="~/Library/Application Support/BDIH/Bottles"
        onSelectBottlePrefixPath={async () => "~/Library/Application Support/BDIH/Bottles"}
        onClose={() => undefined}
        onCreateBottle={() => undefined}
      />
    </div>
  ),
};

export const Breadcrumb: StoryObj<typeof DashboardBreadcrumb> = {
  parameters: {
    layout: "centered",
  },
  render: () => (
    <div className="w-[520px] bg-[#0b1020] p-6 text-slate-100">
      <DashboardBreadcrumb bottleName={mockBottle.name} onBottleHome={() => undefined} onBottleClick={() => undefined} />
    </div>
  ),
};

export const Card: StoryObj<typeof BottleCard> = {
  parameters: {
    layout: "centered",
  },
  render: () => (
    <div className="w-72 bg-[#0b1020] p-4 text-slate-100">
      <BottleCard bottle={mockBottle} onClick={() => undefined} onContextMenu={() => undefined} />
    </div>
  ),
};
