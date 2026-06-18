import type { Meta, StoryObj } from "@storybook/react";
import { Box, Inline, InlineText, Stack, Surface, Text } from "../../../Component/Primitives";

const meta: Meta<typeof Stack> = {
  title: "Component/Primitives/Layout",
  component: Stack,
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof Stack>;

export const StackAndInline: Story = {
  render: () => (
    <Surface tone="deep" padding="lg" className="w-[520px] text-slate-100">
      <Stack gap="md">
        <Text tone="strong" weight="semibold">Stack</Text>
        <Text size="xs" tone="muted">Vertical layout primitive.</Text>
        <Inline gap="sm" wrap>
          <Box className="rounded-lg bg-emerald-400/20 px-3 py-2 text-xs text-emerald-100">One</Box>
          <Box className="rounded-lg bg-sky-400/20 px-3 py-2 text-xs text-sky-100">Two</Box>
          <Box className="rounded-lg bg-amber-400/20 px-3 py-2 text-xs text-amber-100">Three</Box>
        </Inline>
        <InlineText tone="body" size="xs">InlineText keeps text valid inside buttons and listbox items.</InlineText>
      </Stack>
    </Surface>
  ),
};
