import type { Meta, StoryObj } from "@storybook/react";
import { Box, PrimitiveImage, Surface } from "../../../Component/Primitives";

const meta: Meta<typeof PrimitiveImage> = {
  title: "Component/Primitives/Image",
  component: PrimitiveImage,
  parameters: {
    layout: "centered",
  },
  args: {
    src: "https://hoyoplay.hoyoverse.com/favicon.ico",
    alt: "HoYoPlay",
  },
};

export default meta;
type Story = StoryObj<typeof PrimitiveImage>;

export const Image: Story = {
  render: (args) => (
    <Surface tone="deep" padding="lg">
      <Box className="h-24 w-24 overflow-hidden rounded-2xl bg-white/10 p-3 ring-1 ring-white/10">
        <PrimitiveImage {...args} className="object-contain" />
      </Box>
    </Surface>
  ),
};
