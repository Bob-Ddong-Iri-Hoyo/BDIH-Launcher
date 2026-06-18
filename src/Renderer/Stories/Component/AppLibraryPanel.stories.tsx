import type { Meta, StoryObj } from "@storybook/react";
import { AppLibraryPanel } from "../../Component/AppLibraryPanel";
import { mockBottle } from "./mockData";

const meta: Meta<typeof AppLibraryPanel> = {
  title: "Component/AppLibraryPanel",
  component: AppLibraryPanel,
  parameters: {
    layout: "centered",
  },
  args: {
    bottle: mockBottle,
    selectedWineVersionId: "wine-9.0-stable",
    appLogoSrc: "https://bdih.faby.day/favicon.ico",
    onLaunchBottleApp: () => undefined,
    onLaunchBottleAppWithArgs: () => undefined,
    onStopBottleApp: () => undefined,
    onDeleteBottleApp: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof AppLibraryPanel>;

export const Default: Story = {
  render: (args) => (
    <div className="w-[920px] bg-[#0b1020] p-6 text-slate-100">
      <AppLibraryPanel {...args} />
    </div>
  ),
};

export const Empty: Story = {
  args: {
    bottle: {
      ...mockBottle,
      apps: [],
    },
  },
  render: Default.render,
};
