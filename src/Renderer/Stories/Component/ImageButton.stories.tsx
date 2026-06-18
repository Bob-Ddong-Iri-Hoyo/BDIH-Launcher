import type { Meta, StoryObj } from "@storybook/react";
import { ImageButton } from "../../Component/ImageButton";
import { Inline, Stack, Surface, Text } from "../../Component/Primitives";

const meta: Meta<typeof ImageButton> = {
  title: "Component/ImageButton",
  component: ImageButton,
  parameters: {
    layout: "centered",
  },
  args: {
    name: "Genshin Impact",
    subtitle: "GE-Proton Latest · Today",
    src: "https://hoyoplay.hoyoverse.com/favicon.ico",
  },
};

export default meta;
type Story = StoryObj<typeof ImageButton>;

export const Default: Story = {
  render: (args) => (
    <Surface tone="deep" padding="md" className="w-64 text-slate-100">
      <ImageButton {...args} />
    </Surface>
  ),
};

export const Presets: Story = {
  render: (args) => (
    <Surface tone="deep" padding="lg" className="w-[760px] text-slate-100">
      <Stack gap="md">
        <Text tone="strong" weight="semibold">ImageButton presets</Text>
        <Inline gap="md" align="start" wrap>
          <ImageButton {...args} preset="app" className="w-52" />
          <ImageButton {...args} preset="compact" className="w-44" />
          <ImageButton {...args} preset="tile" className="w-52" />
        </Inline>
      </Stack>
    </Surface>
  ),
};

export const ShapeAndBorder: Story = {
  render: (args) => (
    <Surface tone="deep" padding="lg" className="w-[760px] text-slate-100">
      <Inline gap="md" align="start" wrap>
        <ImageButton {...args} radius="sm" border="none" imageShape="rounded" className="w-48" />
        <ImageButton {...args} radius="lg" border="strong" imageShape="circle" className="w-48" />
        <ImageButton {...args} radius="full" border="glow" imageShape="rounded" imageSize="lg" className="w-48" />
      </Inline>
    </Surface>
  ),
};

export const Running: Story = {
  args: {
    isRunning: true,
  },
  render: Default.render,
};

export const Error: Story = {
  args: {
    hasError: true,
    subtitle: "Launch failed: wine exited early",
  },
  render: Default.render,
};

export const WithoutIcon: Story = {
  args: {
    src: undefined,
    name: "Manual App",
  },
  render: Default.render,
};
