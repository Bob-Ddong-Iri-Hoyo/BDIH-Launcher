import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Box, ComboBox, ComboItem, Inline, Stack, Surface, Text } from "../../../Component/Primitives";

function ComboStackPreview() {
  const [values, setValues] = React.useState(["a", "b"]);

  return (
    <Surface tone="deep" padding="lg" className="w-80 text-slate-100">
      <Box className="flex justify-center">
        <ComboBox values={values} onValuesChange={setValues} name="combo-stack" className="space-y-2">
          <Inline gap="sm"><ComboItem value="a" /><Text tone="body" size="sm">A</Text></Inline>
          <Inline gap="sm"><ComboItem value="b" /><Text tone="body" size="sm">B</Text></Inline>
          <Inline gap="sm"><ComboItem value="c" /><Text tone="body" size="sm">C</Text></Inline>
        </ComboBox>
      </Box>
    </Surface>
  );
}

function ComboInlinePreview() {
  const [values, setValues] = React.useState(["b"]);

  return (
    <Surface tone="deep" padding="lg" className="w-80 text-slate-100">
      <Box className="flex justify-center">
        <ComboBox values={values} onValuesChange={setValues} name="combo-inline">
          <Inline gap="md" wrap>
            <Inline gap="sm"><ComboItem value="a" /><Text tone="body" size="sm">A</Text></Inline>
            <Inline gap="sm"><ComboItem value="b" /><Text tone="body" size="sm">B</Text></Inline>
            <Inline gap="sm"><ComboItem value="c" /><Text tone="body" size="sm">C</Text></Inline>
          </Inline>
        </ComboBox>
      </Box>
    </Surface>
  );
}

const meta: Meta<typeof ComboBox> = {
  title: "Component/Primitives/Combo",
  component: ComboBox,
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof ComboBox>;

export const StackDirection: Story = {
  render: () => <ComboStackPreview />,
};

export const InlineDirection: Story = {
  render: () => <ComboInlinePreview />,
};
