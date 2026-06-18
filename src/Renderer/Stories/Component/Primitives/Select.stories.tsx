import type { Meta, StoryObj } from "@storybook/react";
import { Select, Surface } from "../../../Component/Primitives";

const meta: Meta<typeof Select> = {
  title: "Component/Primitives/Select",
  component: Select,
  parameters: {
    layout: "centered",
  },
  args: {
    value: "rose",
    label: "Accent color",
    options: [
      { value: "rose", label: "Rose", swatchColor: "rgb(244 63 94)" },
      { value: "sky", label: "Sky", swatchColor: "rgb(14 165 233)" },
      { value: "emerald", label: "Emerald", swatchColor: "rgb(16 185 129)" },
    ],
    onChange: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof Select>;

export const Default: Story = {
  render: (args) => (
    <Surface tone="deep" padding="lg" className="w-80 text-slate-100">
      <Select {...args} />
    </Surface>
  ),
};

export const WithFavorites: Story = {
  args: {
    enableFavorites: true,
    searchPlaceholder: "Search colors",
    options: [
      { value: "rose", label: "Rose", description: "Warm accent", swatchColor: "rgb(244 63 94)" },
      { value: "sky", label: "Sky", description: "Cool accent", swatchColor: "rgb(14 165 233)" },
      { value: "emerald", label: "Emerald", description: "Fresh accent", swatchColor: "rgb(16 185 129)" },
      { value: "amber", label: "Amber", description: "Bright accent", swatchColor: "rgb(245 158 11)" },
    ],
  },
  render: (args) => (
    <Surface tone="deep" padding="lg" className="w-96 text-slate-100">
      <Select {...args} />
    </Surface>
  ),
};
