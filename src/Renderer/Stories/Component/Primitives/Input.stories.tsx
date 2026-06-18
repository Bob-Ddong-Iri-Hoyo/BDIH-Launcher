import type { Meta, StoryObj } from "@storybook/react";
import { FieldLabel, Input, Stack, Surface, Text } from "../../../Component/Primitives";

const meta: Meta<typeof Input> = {
  title: "Component/Primitives/Input",
  component: Input,
  parameters: {
    layout: "centered",
  },
  args: {
    placeholder: "C:\\Program Files\\Steam\\steam.exe",
    tone: "mono",
  },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  render: (args) => (
    <Surface tone="deep" padding="lg" className="w-[520px] text-slate-100">
      <Stack gap="sm">
        <Input {...args} />
      </Stack>
    </Surface>
  ),
};
export const TitledAndDescripted: Story = {
  render: (args) => (
    <Surface tone="deep" padding="lg" className="w-[520px] text-slate-100">
      <Stack gap="sm">
        <FieldLabel>Executable path</FieldLabel>
        <Input {...args} />
        <Text size="xs" tone="muted">Primitive input with shared launcher focus styling.</Text>
      </Stack>
    </Surface>
  ),
};
