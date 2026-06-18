import type { Meta, StoryObj } from "@storybook/react";
import { ProgressBar, Stack, Surface } from "../../../Component/Primitives";

const meta: Meta<typeof ProgressBar> = {
  title: "Component/Primitives/ProgressBar",
  component: ProgressBar,
  parameters: {
    layout: "centered",
  },
  args: {
    value: 48,
  },
};

export default meta;
type Story = StoryObj<typeof ProgressBar>;

export const Default: Story = {
  render: (args) => (
    <Surface tone="deep" padding="lg" className="w-96 text-slate-100">
      <ProgressBar {...args} />
    </Surface>
  ),
};

export const Sizes: Story = {
  render: () => (
    <Surface tone="deep" padding="lg" className="w-96 text-slate-100">
      <Stack gap="md">
        <ProgressBar value={35} size="xs" />
        <ProgressBar value={55} size="sm" />
        <ProgressBar value={75} size="md" />
      </Stack>
    </Surface>
  ),
};

export const Tones: Story = {
  render: () => (
    <Surface tone="deep" padding="lg" className="w-96 text-slate-100">
      <Stack gap="md">
        <ProgressBar value={20} tone="emerald" />
        <ProgressBar value={40} tone="sky" />
        <ProgressBar value={60} tone="amber" />
        <ProgressBar value={80} tone="rose" />
      </Stack>
    </Surface>
  ),
};
