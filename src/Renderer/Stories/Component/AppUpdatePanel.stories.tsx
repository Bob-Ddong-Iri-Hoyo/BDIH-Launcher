import type { Meta, StoryObj } from "@storybook/react";
import { AppUpdatePanel } from "../../Component/AppUpdatePanel";

const meta: Meta<typeof AppUpdatePanel> = {
  title: "Component/AppUpdatePanel",
  component: AppUpdatePanel,
  parameters: {
    layout: "centered",
  },
  args: {
    autoUpdateEnabled: true,
    onAutoUpdateChange: () => undefined,
    onCheckForUpdates: () => undefined,
    onInstallUpdate: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof AppUpdatePanel>;

export const Idle: Story = {
  render: (args) => (
    <div className="w-[720px] bg-[#0b1020] p-8 text-slate-100">
      <AppUpdatePanel {...args} />
    </div>
  ),
};

export const UpdateConfirmation: Story = {
  name: "Update confirmation",
  parameters: {
    docs: {
      description: {
        story: "Click Check updates to review the Later and Update confirmation shown before process cleanup and download begin.",
      },
    },
  },
  args: {
    status: {
      status: "available",
      message: "Update is available.",
      version: "1.2.0",
    },
  },
  render: (args) => (
    <div className="w-[720px] bg-[#0b1020] p-8 text-slate-100">
      <AppUpdatePanel {...args} />
    </div>
  ),
};

export const Error: Story = {
  args: {
    autoUpdateEnabled: false,
    status: {
      status: "error",
      message: "Update check failed.",
      error: "Failed to resolve update feed.",
    },
  },
  render: (args) => (
    <div className="w-[720px] bg-[#0b1020] p-8 text-slate-100">
      <AppUpdatePanel {...args} />
    </div>
  ),
};

export const ConnectionRefused: Story = {
  args: {
    autoUpdateEnabled: false,
    status: {
      status: "error",
      message: "Update check failed.",
      error: "Error: net::ERR_CONNECTION_REFUSED\nUpdate URL: http://127.0.0.1:45678/nightly-mac.yml",
    },
  },
  render: (args) => (
    <div className="w-[720px] bg-[#0b1020] p-8 text-slate-100">
      <AppUpdatePanel {...args} />
    </div>
  ),
};
