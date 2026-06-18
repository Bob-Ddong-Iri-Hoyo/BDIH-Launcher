import type { Meta, StoryObj } from "@storybook/react";
import { BottleActionBar } from "../../Component/BottleActionBar";
import { mockBottles } from "./mockData";

const meta: Meta<typeof BottleActionBar> = {
  title: "Component/BottleActionBar",
  component: BottleActionBar,
  parameters: {
    layout: "centered",
  },
  args: {
    bottle: mockBottles[0],
    wineRuntimePath: "~/Library/Application Support/BDIH/Wine/wine-9.0-stable",
    onInstallBottleLauncher: () => undefined,
    onRegisterBottleExecutable: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof BottleActionBar>;

export const Default: Story = {
  render: (args) => (
    <div className="bg-[#0b1020] p-6 text-slate-100">
      <BottleActionBar {...args} />
    </div>
  ),
};

export const Installing: Story = {
  args: {
    bottle: mockBottles[1],
  },
  render: Default.render,
};
