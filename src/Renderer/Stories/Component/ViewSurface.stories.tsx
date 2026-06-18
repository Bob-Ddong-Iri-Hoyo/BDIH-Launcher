import type { Meta, StoryObj } from "@storybook/react";
import { ViewSurface } from "../../Component/ViewSurface";

const meta: Meta<typeof ViewSurface> = {
  title: "Component/ViewSurface",
  component: ViewSurface,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    className: "bg-[#0b1020] text-slate-100",
  },
};

export default meta;
type Story = StoryObj<typeof ViewSurface>;

export const Default: Story = {
  render: (args) => (
    <div className="h-dvh">
      <ViewSurface {...args}>
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <p className="text-sm font-semibold text-white">Renderer surface</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">Content is padded and fills the available view height.</p>
        </div>
      </ViewSurface>
    </div>
  ),
};
