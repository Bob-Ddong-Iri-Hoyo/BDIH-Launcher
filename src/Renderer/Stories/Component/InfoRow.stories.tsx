import type { Meta, StoryObj } from "@storybook/react";
import { InfoRow } from "../../Component/InfoRow";

const meta: Meta<typeof InfoRow> = {
  title: "Component/InfoRow",
  component: InfoRow,
  parameters: {
    layout: "centered",
  },
  args: {
    label: "Wine version",
    value: "Wine 9.0 Stable",
  },
};

export default meta;
type Story = StoryObj<typeof InfoRow>;

export const Default: Story = {
  render: (args) => (
    <div className="w-96 bg-[#0b1020] p-6 text-slate-100">
      <InfoRow {...args} />
    </div>
  ),
};

export const LongPath: Story = {
  args: {
    label: "Prefix path",
    value: "~/Library/Application Support/BDIH/Bottles/HoyoVerse Bottle/drive_c/Program Files/HoyoPlay/launcher.exe",
    breakAll: true,
  },
  render: Default.render,
};
