import type { Meta, StoryObj } from "@storybook/react";
import { FolderOpen, Play, Settings } from "lucide-react";
import { Button, Inline, Surface } from "../../../Component/Primitives";

const meta: Meta<typeof Button> = {
  title: "Component/Primitives/Button",
  component: Button,
  parameters: {
    layout: "centered",
  },
  args: {
    children: "Button",
    variant: "glass",
    size: "sm",
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Variants: Story = {
  render: () => (
    <Surface tone="deep" padding="lg" className="text-slate-100">
      <Inline gap="md" wrap>
        <Button variant="primary" icon={<Play size={16} />}>Primary</Button>
        <Button variant="glass" icon={<FolderOpen size={16} />}>Glass</Button>
        <Button variant="ghost" icon={<Settings size={16} />}>Ghost</Button>
        <Button variant="listbox" selected>Selected</Button>
        <Button disabled>Disabled</Button>
      </Inline>
    </Surface>
  ),
};

export const Default: Story = {};
