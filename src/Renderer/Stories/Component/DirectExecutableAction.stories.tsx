import type { Meta, StoryObj } from "@storybook/react";
import { DirectExecutableAction } from "../../Component/DirectExecutableAction";
import { Surface } from "../../Component/Primitives";
import { mockBottle } from "./mockData";

const meta: Meta<typeof DirectExecutableAction> = {
  title: "Component/DirectExecutableAction",
  component: DirectExecutableAction,
  parameters: {
    layout: "centered",
  },
  args: {
    bottle: mockBottle,
    wineRuntimePath: "~/Library/Application Support/BDIH/Wine/wine-9.0-stable",
    onRegisterBottleExecutable: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof DirectExecutableAction>;

export const Default: Story = {
  render: (args) => (
    <Surface tone="deep" padding="lg" className="text-slate-100">
      <DirectExecutableAction {...args} />
    </Surface>
  ),
};

export const MissingRuntime: Story = {
  args: {
    wineRuntimePath: undefined,
  },
  render: Default.render,
};
