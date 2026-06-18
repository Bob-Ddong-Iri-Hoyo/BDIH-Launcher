import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Box, Inline, RadioGroup, RadioItem, Surface, Text } from "../../../Component/Primitives";

function RadioStackPreview() {
  const [value, setValue] = React.useState("a");

  return (
    <Surface tone="deep" padding="lg" className="w-80 text-slate-100">
      <Box className="flex justify-center">
        <RadioGroup name="radio-stack" value={value} onValueChange={setValue} className="space-y-2">
          <Inline gap="sm"><RadioItem value="a" /><Text tone="body" size="sm">A</Text></Inline>
          <Inline gap="sm"><RadioItem value="b" /><Text tone="body" size="sm">B</Text></Inline>
          <Inline gap="sm"><RadioItem value="c" /><Text tone="body" size="sm">C</Text></Inline>
        </RadioGroup>
      </Box>
    </Surface>
  );
}

function RadioInlinePreview() {
  const [value, setValue] = React.useState("b");

  return (
    <Surface tone="deep" padding="lg" className="w-80 text-slate-100">
      <Box className="flex justify-center">
        <RadioGroup name="radio-inline" value={value} onValueChange={setValue}>
          <Inline gap="md" wrap>
            <Inline gap="sm"><RadioItem value="a" /><Text tone="body" size="sm">A</Text></Inline>
            <Inline gap="sm"><RadioItem value="b" /><Text tone="body" size="sm">B</Text></Inline>
            <Inline gap="sm"><RadioItem value="c" /><Text tone="body" size="sm">C</Text></Inline>
          </Inline>
        </RadioGroup>
      </Box>
    </Surface>
  );
}

const meta: Meta<typeof RadioGroup> = {
  title: "Component/Primitives/Radio",
  component: RadioGroup,
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof RadioGroup>;

export const StackDirection: Story = {
  render: () => <RadioStackPreview />,
};

export const InlineDirection: Story = {
  render: () => <RadioInlinePreview />,
};
