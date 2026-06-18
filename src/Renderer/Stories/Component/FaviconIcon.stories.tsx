import type { Meta, StoryObj } from "@storybook/react";
import { FaviconIcon } from "../../Component/FaviconIcon";

const meta: Meta<typeof FaviconIcon> = {
  title: "Component/FaviconIcon",
  component: FaviconIcon,
  parameters: {
    layout: "centered",
  },
  args: {
    src: "https://store.steampowered.com/favicon.ico",
    label: "Steam",
  },
};

export default meta;
type Story = StoryObj<typeof FaviconIcon>;

export const Default: Story = {
  render: (args) => (
    <div className="bg-[#0b1020] p-6 text-slate-100">
      <FaviconIcon {...args} />
    </div>
  ),
};

export const Fallback: Story = {
  args: {
    src: "/missing-favicon.ico",
    label: "HoyoPlay",
  },
  render: Default.render,
};
