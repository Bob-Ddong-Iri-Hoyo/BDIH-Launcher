import type { Meta, StoryObj } from "@storybook/react";
import { Stack, StatusMessage, Surface, Text } from "../../../Component/Primitives";

const meta: Meta<typeof Surface> = {
  title: "Component/Primitives/Panel",
  component: Surface,
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof Surface>;

export const Surfaces: Story = {
  render: () => (
    <Stack gap="md" className="w-[520px] text-slate-100">
      <Surface tone="default"><Text tone="strong">Default surface</Text></Surface>
      <Surface tone="deep"><Text tone="strong">Deep surface</Text></Surface>
      <Surface tone="subtle"><Text tone="strong">Subtle surface</Text></Surface>
      <StatusMessage>Status message primitive</StatusMessage>
    </Stack>
  ),
};
