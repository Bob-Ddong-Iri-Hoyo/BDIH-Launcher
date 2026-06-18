import type { Meta, StoryObj } from "@storybook/react";
import { RecipeDialog } from "../../Component/RecipeDialog";
import { mockBottle } from "./mockData";

const meta: Meta<typeof RecipeDialog> = {
  title: "Component/RecipeDialog",
  component: RecipeDialog,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    bottle: mockBottle,
    open: true,
    onClose: () => undefined,
    onRevealBottle: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof RecipeDialog>;

export const Open: Story = {
  render: (args) => (
    <div className="min-h-dvh bg-[#0b1020] p-6 text-slate-100">
      <RecipeDialog {...args} />
    </div>
  ),
};
