import type { Meta, StoryObj } from "@storybook/react";
import { FolderOpen, Play, Settings } from "lucide-react";
import { IconButton } from "../../Component/IconButton";

const meta: Meta<typeof IconButton> = {
  title: "Component/IconButton",
  component: IconButton,
  parameters: {
    layout: "centered",
  },
  args: {
    icon: Settings,
    label: "Settings",
  },
};

export default meta;
type Story = StoryObj<typeof IconButton>;

export const Default: Story = {
  render: (args) => (
    <div className="flex gap-3 bg-[#0b1020] p-6 text-slate-100">
      <IconButton {...args} />
      <IconButton icon={Play} label="Run" />
      <IconButton icon={FolderOpen} label="Open folder" size="sm" />
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
  render: Default.render,
};
