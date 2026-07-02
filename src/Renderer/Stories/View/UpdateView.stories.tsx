import type { Meta, StoryObj } from "@storybook/react";
import { UpdateFlowPreview } from "../../Component/UpdateFlowPreview";

const meta: Meta<typeof UpdateFlowPreview> = {
  title: "View/UpdateView",
  component: UpdateFlowPreview,
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof UpdateFlowPreview>;

export const PreferenceManualUpdateSuccess: Story = {
  args: {
    title: "Manual update from Preferences",
    description: "A fixed-height demo for checking, downloading, and finishing a manual update from Settings.",
    mode: "manual",
    result: "success",
  },
};

export const PreferenceManualUpdateFailure: Story = {
  args: {
    title: "Manual update failure",
    description: "The same manual flow when the update is found but package verification fails.",
    mode: "manual",
    result: "failure",
  },
};

export const PreferenceManualAlreadyLatest: Story = {
  args: {
    title: "Manual update already latest",
    description: "The no-update result after a user checks manually from Preferences.",
    mode: "manual",
    result: "notAvailable",
  },
};

export const StartupAutoUpdateSuccess: Story = {
  args: {
    title: "Startup auto-check with update",
    description: "A stable startup update surface. The confirmation area appears below the status area instead of moving the whole view.",
    mode: "startup",
    result: "success",
  },
};

export const StartupAutoUpdateFailure: Story = {
  args: {
    title: "Startup auto-check failure",
    description: "Startup auto-check finds an update, then demonstrates a failed download state.",
    mode: "startup",
    result: "failure",
  },
};

export const StartupAutoAlreadyLatest: Story = {
  args: {
    title: "Startup auto-check already latest",
    description: "Startup auto-check confirms that the launcher is current and shows the quiet completion state.",
    mode: "startup",
    result: "notAvailable",
  },
};
