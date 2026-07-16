import type { Meta, StoryObj } from "@storybook/react";
import { AppUpdateInstallDialog } from "../../Component/AppUpdateInstallDialog";
import { Box, Stack, Text } from "../../Component/Primitives";

const meta: Meta<typeof AppUpdateInstallDialog> = {
  title: "Component/AppUpdateInstallDialog",
  component: AppUpdateInstallDialog,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <Box className="h-dvh bg-[#0b1020] p-8 text-slate-100">
        <Stack className="gap-3 opacity-60">
          <Text className="text-xl font-semibold">BDIH Launcher</Text>
          <Text className="text-sm text-slate-400">The main view remains visible behind the update dialog.</Text>
        </Stack>
        <Story />
      </Box>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof AppUpdateInstallDialog>;

export const CheckingProcesses: Story = {
  args: {
    progress: { stage: "checking-processes", progress: 5 },
  },
};

export const StoppingProcesses: Story = {
  args: {
    progress: { stage: "stopping-processes", progress: 20 },
  },
};

export const Downloading: Story = {
  args: {
    progress: { stage: "downloading", progress: 62 },
  },
};

export const Installing: Story = {
  args: {
    progress: { stage: "installing", progress: 96 },
  },
};
